import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';

export const COMMANDS_TABLE = 'computer_commands';
export const SCREENS_TABLE = 'computer_screens';

/**
 * What an administrator may ask a workstation to do.
 *
 * `wake` is the odd one out: a machine that is off cannot poll for work, so
 * the server sends a Wake-on-LAN packet itself rather than queueing it.
 */
export const ACTIONS = {
  shutdown: { label: 'Shut down', confirm: true },
  restart: { label: 'Restart', confirm: true },
  lock: { label: 'Freeze', confirm: false },
  unlock: { label: 'Unfreeze', confirm: false },
  message: { label: 'Send warning', confirm: false },
  screenshot: { label: 'Capture screen', confirm: false },
  wake: { label: 'Power on', confirm: false, serverSide: true },
};

/** A queued command older than this is assumed missed and is expired. */
const STALE_AFTER_MS = 2 * 60 * 1000;

export function assertValidAction(action) {
  if (!Object.hasOwn(ACTIONS, action)) {
    throw ApiError.badRequest('That is not a command this system can send.');
  }
}

/** Queues a command for the agent on a machine to pick up. */
export async function queueCommand({ computerId, action, payload = {}, issuedBy }) {
  assertValidAction(action);

  const { data, error } = await supabase
    .from(COMMANDS_TABLE)
    .insert({ computer_id: computerId, action, payload, issued_by: issuedBy })
    .select('id, computer_id, action, payload, status, issued_at')
    .single();

  if (error) {
    console.error('[command] could not queue:', error.message);
    throw ApiError.internal('The command could not be sent. Please try again.');
  }

  return data;
}

/**
 * Hands the agent everything waiting for its machine and marks it SENT, so
 * two polls in quick succession cannot run the same command twice.
 */
export async function claimCommands(computerId) {
  const { data: pending, error } = await supabase
    .from(COMMANDS_TABLE)
    .select('id, action, payload')
    .eq('computer_id', computerId)
    .eq('status', 'PENDING')
    .order('issued_at', { ascending: true })
    .limit(10);

  if (error) throw ApiError.internal();
  if (!pending?.length) return [];

  await supabase
    .from(COMMANDS_TABLE)
    .update({ status: 'SENT', claimed_at: new Date().toISOString() })
    .in('id', pending.map((c) => c.id));

  return pending;
}

/** Records what happened when the agent ran a command. */
export async function completeCommand(id, { ok, result }) {
  const { error } = await supabase
    .from(COMMANDS_TABLE)
    .update({
      status: ok ? 'DONE' : 'FAILED',
      finished_at: new Date().toISOString(),
      result: result ? String(result).slice(0, 500) : null,
    })
    .eq('id', id);

  if (error) console.error('[command] could not record result:', error.message);
}

/**
 * Expires commands nobody collected — a machine switched off between the
 * click and the next poll. Without this they would fire whenever it next
 * came online, which could be days later.
 */
export async function expireStaleCommands() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { error } = await supabase
    .from(COMMANDS_TABLE)
    .update({ status: 'EXPIRED', finished_at: new Date().toISOString() })
    .in('status', ['PENDING', 'SENT'])
    .lt('issued_at', cutoff);

  if (error) console.error('[command] expiry sweep failed:', error.message);
}

export default { queueCommand, claimCommands, completeCommand, expireStaleCommands, ACTIONS };

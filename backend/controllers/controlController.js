import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { recordAudit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';
import {
  COMMANDS_TABLE,
  SCREENS_TABLE,
  ACTIONS,
  assertValidAction,
  queueCommand,
  claimCommands,
  completeCommand,
} from '../services/commandService.js';
import { sendMagicPacket } from '../services/wakeOnLan.js';

const SCREEN_BUCKET = 'screens';
const MAX_SCREEN_BYTES = 900_000;

/* =====================================================================
   Administrator side
   ===================================================================== */

/**
 * POST /api/control/:computerId/:action
 *
 * Queues a command for a workstation. Every call is written to the audit
 * log before anything else: shutting down a machine somebody is working at
 * is disruptive, and it should always be clear who did it.
 */
export const sendCommand = asyncHandler(async (req, res) => {
  const { computerId, action } = req.params;
  assertValidAction(action);

  const { data: computer, error } = await supabase
    .from(TABLES.computers)
    .select('id, name, mac_address, logged_in_user, current_user_id')
    .eq('id', computerId)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!computer) throw ApiError.notFound('That computer could not be found.');

  await recordAudit(req, {
    action: `control.${action}`,
    entity: 'computers',
    entityId: computer.id,
    details: { computer: computer.name, message: req.body?.message ?? null },
  });

  // Waking a machine cannot be queued — it is not running to collect it.
  if (action === 'wake') {
    if (!computer.mac_address) {
      throw ApiError.badRequest(
        `${computer.name} has no MAC address recorded, so it cannot be woken. Add one in Computers.`
      );
    }
    try {
      const result = await sendMagicPacket(computer.mac_address);
      return res.json({
        success: true,
        message: `Wake signal sent to ${computer.name}.`,
        data: result,
      });
    } catch (wakeError) {
      throw ApiError.badRequest(wakeError.message);
    }
  }

  const payload = {};
  if (action === 'message') {
    const text = String(req.body?.message ?? '').trim();
    if (text.length < 2) throw ApiError.badRequest('Type the warning you want to show.');
    payload.message = text.slice(0, 500);
    payload.level = req.body?.level === 'warning' ? 'warning' : 'info';
  }
  if (action === 'lock') {
    payload.reason = String(req.body?.message ?? '').trim().slice(0, 300) || null;
  }

  const command = await queueCommand({
    computerId: computer.id,
    action,
    payload,
    issuedBy: req.user.id,
  });

  // If somebody is booked on the machine, tell them in the app as well —
  // the on-screen message only helps if they are looking at the screen.
  if ((action === 'message' || action === 'lock') && computer.current_user_id) {
    await notify(computer.current_user_id, {
      title: action === 'lock' ? 'Your workstation was locked' : 'Message from the laboratory',
      message: payload.message ?? payload.reason ?? 'Please speak to the laboratory administrator.',
      type: 'warning',
    });
  }

  res.status(202).json({
    success: true,
    message: `${ACTIONS[action].label} sent to ${computer.name}. It runs when the machine next checks in.`,
    data: command,
  });
});

/** GET /api/control/commands — recent command history for the admin view. */
export const listCommands = asyncHandler(async (req, res) => {
  let query = supabase
    .from(COMMANDS_TABLE)
    .select(`
      id, action, payload, status, issued_at, finished_at, result,
      computer:computers ( id, name ),
      issuer:users ( id, full_name )
    `)
    .order('issued_at', { ascending: false })
    .limit(40);

  if (req.query.computer_id) query = query.eq('computer_id', req.query.computer_id);

  const { data, error } = await query;
  if (error) throw ApiError.internal();

  res.json({
    success: true,
    data: (data ?? []).map((row) => ({
      ...row,
      computer: Array.isArray(row.computer) ? row.computer[0] : row.computer,
      issuer: Array.isArray(row.issuer) ? row.issuer[0] : row.issuer,
    })),
  });
});

/** GET /api/control/screens — the latest capture from every machine. */
export const listScreens = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from(SCREENS_TABLE)
    .select('computer_id, image_url, width, height, captured_at');

  if (error) throw ApiError.internal();

  // Keyed by computer so the wall can look each one up directly.
  const byComputer = Object.fromEntries((data ?? []).map((row) => [row.computer_id, row]));
  res.json({ success: true, data: byComputer });
});

/* =====================================================================
   Agent side — authenticated with the shared agent key, not a session
   ===================================================================== */

/**
 * GET /api/control/agent/:computerId/commands
 * The agent asks what it should do. Claiming marks the work SENT so a
 * retry cannot run the same command a second time.
 */
export const agentPoll = asyncHandler(async (req, res) => {
  const commands = await claimCommands(req.params.computerId);
  res.json({ success: true, data: commands });
});

/** POST /api/control/agent/commands/:id/result */
export const agentResult = asyncHandler(async (req, res) => {
  await completeCommand(req.params.id, {
    ok: req.body?.ok !== false,
    result: req.body?.result,
  });
  res.json({ success: true });
});

/**
 * POST /api/control/agent/:computerId/screen
 *
 * A desktop capture, as a base64 JPEG. Each machine overwrites its own
 * single file rather than accumulating history: a wall of live thumbnails
 * needs the latest frame, and keeping every frame from 30 machines would
 * fill the bucket within a day.
 */
export const agentScreen = asyncHandler(async (req, res) => {
  const { computerId } = req.params;
  const match = /^data:(image\/jpeg|image\/webp);base64,(.+)$/.exec(String(req.body?.image ?? ''));
  if (!match) throw ApiError.badRequest('Send the capture as a base64 JPEG data URL.');

  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw ApiError.badRequest('That capture is empty.');
  if (bytes.length > MAX_SCREEN_BYTES) throw ApiError.badRequest('That capture is too large.');

  const path = `${computerId}/latest.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(SCREEN_BUCKET)
    .upload(path, bytes, { contentType: match[1], upsert: true, cacheControl: '0' });

  if (uploadError) {
    console.error('[screen] upload failed:', uploadError.message);
    throw ApiError.internal();
  }

  const { data: pub } = supabase.storage.from(SCREEN_BUCKET).getPublicUrl(path);
  const capturedAt = new Date().toISOString();

  const { error } = await supabase.from(SCREENS_TABLE).upsert(
    {
      computer_id: computerId,
      // A changing query string defeats browser caching of the same path.
      image_url: `${pub.publicUrl}?t=${Date.now()}`,
      width: Number(req.body?.width) || null,
      height: Number(req.body?.height) || null,
      captured_at: capturedAt,
    },
    { onConflict: 'computer_id' }
  );

  if (error) throw ApiError.internal();

  res.json({ success: true, data: { captured_at: capturedAt } });
});

/** PATCH /api/control/agent/:computerId/state — who is signed in, lock state. */
export const agentState = asyncHandler(async (req, res) => {
  const patch = {};
  if (req.body?.logged_in_user !== undefined) {
    patch.logged_in_user = String(req.body.logged_in_user ?? '').slice(0, 120) || null;
  }
  if (req.body?.is_locked !== undefined) patch.is_locked = Boolean(req.body.is_locked);
  if (req.body?.mac_address !== undefined) {
    patch.mac_address = String(req.body.mac_address ?? '').slice(0, 32) || null;
  }

  if (!Object.keys(patch).length) return res.json({ success: true });

  const { error } = await supabase
    .from(TABLES.computers)
    .update(patch)
    .eq('id', req.params.computerId);

  if (error) throw ApiError.internal();
  res.json({ success: true });
});

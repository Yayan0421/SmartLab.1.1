import { supabase, TABLES } from '../config/database.js';

/**
 * Writes an audit entry. Deliberately fire-and-forget: a logging failure
 * must never turn a successful action into an error for the user.
 */
export async function recordAudit(req, { action, entity, entityId = null, details = {} }) {
  try {
    await supabase.from(TABLES.auditLogs).insert({
      actor_id: req.user?.id ?? null,
      actor_email: req.user?.email ?? null,
      action,
      entity,
      entity_id: entityId ? String(entityId) : null,
      details,
      ip_address: req.ip ?? null,
    });
  } catch (error) {
    console.error('[audit] failed to record entry:', error.message);
  }
}

export default { recordAudit };

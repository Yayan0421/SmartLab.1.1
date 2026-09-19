import { supabase, TABLES } from '../config/database.js';

/**
 * Creates a notification for one user. Rows land in a Realtime-enabled
 * table, so connected clients can subscribe instead of polling.
 */
export async function notify(userId, { title, message = '', type = 'info', link = null }) {
  if (!userId) return;
  try {
    await supabase.from(TABLES.notifications).insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    });
  } catch (error) {
    console.error('[notify] failed:', error.message);
  }
}

/** Fans a notification out to every active admin (e.g. a new booking request). */
export async function notifyAdmins({ title, message = '', type = 'info', link = null }) {
  try {
    const { data, error } = await supabase
      .from(TABLES.users)
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active');

    if (error || !data?.length) return;

    await supabase.from(TABLES.notifications).insert(
      data.map((admin) => ({ user_id: admin.id, title, message, type, link }))
    );
  } catch (error) {
    console.error('[notifyAdmins] failed:', error.message);
  }
}

export default { notify, notifyAdmins };

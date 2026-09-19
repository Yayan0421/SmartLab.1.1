import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';

/** GET /api/notifications — always scoped to the caller. */
export const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = getPagination(req.query);

  let query = supabase
    .from(TABLES.notifications)
    .select('id, title, message, type, link, is_read, created_at', { count: 'exact' })
    .eq('user_id', req.user.id);

  if (req.query.unread === 'true') query = query.eq('is_read', false);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw ApiError.internal();

  const { count: unread } = await supabase
    .from(TABLES.notifications)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .eq('is_read', false);

  res.json({ success: true, unread: unread ?? 0, ...paginated(data ?? [], count, { page, limit }) });
});

/** PATCH /api/notifications/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from(TABLES.notifications)
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id) // ownership is part of the WHERE clause
    .select('id, is_read')
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That notification could not be found.');

  res.json({ success: true, data });
});

/** PATCH /api/notifications/read-all */
export const markAllRead = asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from(TABLES.notifications)
    .update({ is_read: true })
    .eq('user_id', req.user.id)
    .eq('is_read', false);

  if (error) throw ApiError.internal();
  res.json({ success: true, message: 'All notifications marked as read.' });
});

/** DELETE /api/notifications/:id */
export const removeNotification = asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from(TABLES.notifications)
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw ApiError.internal();
  res.json({ success: true, message: 'Notification removed.' });
});

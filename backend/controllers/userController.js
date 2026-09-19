import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { hashPassword, generateTempPassword } from '../utils/password.js';
import { recordAudit } from '../services/auditService.js';
import { PUBLIC_FIELDS } from './authController.js';

/** GET /api/users — admin only, paginated and filterable. */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, role, status, sort, order } = req.query;
  const { from, to } = getPagination({ page, limit });

  let query = supabase.from(TABLES.users).select(PUBLIC_FIELDS, { count: 'exact' });

  if (role) query = query.eq('role', role);
  if (status) query = query.eq('status', status);
  if (search) {
    const term = `%${search.replace(/[%_]/g, '')}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term},id_number.ilike.${term}`);
  }

  const { data, count, error } = await query
    .order(sort, { ascending: order === 'asc', nullsFirst: false })
    .range(from, to);

  if (error) throw ApiError.internal();

  res.json({ success: true, ...paginated(data, count, { page, limit }) });
});

/** GET /api/users/stats — role and status breakdown for the dashboard. */
export const userStats = asyncHandler(async (_req, res) => {
  const counts = await Promise.all(
    ['admin', 'faculty', 'student'].map((role) =>
      supabase.from(TABLES.users).select('id', { count: 'exact', head: true }).eq('role', role)
    )
  );

  const [total, active] = await Promise.all([
    supabase.from(TABLES.users).select('id', { count: 'exact', head: true }),
    supabase.from(TABLES.users).select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  res.json({
    success: true,
    data: {
      total: total.count ?? 0,
      active: active.count ?? 0,
      admins: counts[0].count ?? 0,
      faculty: counts[1].count ?? 0,
      students: counts[2].count ?? 0,
    },
  });
});

/** GET /api/users/:id */
export const getUser = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from(TABLES.users)
    .select(PUBLIC_FIELDS)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That user could not be found.');

  const { count: bookingCount } = await supabase
    .from(TABLES.bookings)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', data.id);

  res.json({ success: true, data: { ...data, booking_count: bookingCount ?? 0 } });
});

/** POST /api/users */
export const createUser = asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;

  const { data: existing } = await supabase
    .from(TABLES.users)
    .select('id')
    .eq('email', rest.email)
    .maybeSingle();

  if (existing) throw ApiError.conflict('An account with that email already exists.');

  const { data, error } = await supabase
    .from(TABLES.users)
    .insert({
      ...rest,
      department: rest.department || null,
      id_number: rest.id_number || null,
      phone: rest.phone || null,
      password_hash: await hashPassword(password),
    })
    .select(PUBLIC_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('An account with that email already exists.');
    throw ApiError.internal();
  }

  await recordAudit(req, {
    action: 'user.create',
    entity: 'users',
    entityId: data.id,
    details: { role: data.role },
  });

  res.status(201).json({ success: true, data });
});

/** PATCH /api/users/:id */
export const updateUser = asyncHandler(async (req, res) => {
  const targetId = req.params.id;

  const { data: target, error: findError } = await supabase
    .from(TABLES.users)
    .select('id, role, status, email')
    .eq('id', targetId)
    .maybeSingle();

  if (findError) throw ApiError.internal();
  if (!target) throw ApiError.notFound('That user could not be found.');

  const patch = { ...req.body };

  // Guard rails on self-edits: an admin cannot demote or deactivate the
  // account they are signed in with, which would lock them out mid-session.
  if (targetId === req.user.id) {
    if (patch.role && patch.role !== target.role) {
      throw ApiError.forbidden('You cannot change your own role.');
    }
    if (patch.status && patch.status !== 'active') {
      throw ApiError.forbidden('You cannot deactivate your own account.');
    }
  }

  // Never remove the last remaining admin.
  if (target.role === 'admin' && (patch.role === 'faculty' || patch.role === 'student' || (patch.status && patch.status !== 'active'))) {
    const { count } = await supabase
      .from(TABLES.users)
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active');

    if ((count ?? 0) <= 1) {
      throw ApiError.conflict('The system must keep at least one active administrator.');
    }
  }

  if (patch.email && patch.email !== target.email) {
    const { data: clash } = await supabase
      .from(TABLES.users)
      .select('id')
      .eq('email', patch.email)
      .neq('id', targetId)
      .maybeSingle();
    if (clash) throw ApiError.conflict('An account with that email already exists.');
  }

  for (const key of ['department', 'id_number', 'phone']) {
    if (patch[key] === '') patch[key] = null;
  }

  const { data, error } = await supabase
    .from(TABLES.users)
    .update(patch)
    .eq('id', targetId)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, {
    action: 'user.update',
    entity: 'users',
    entityId: targetId,
    details: patch,
  });

  res.json({ success: true, data });
});

/** POST /api/users/:id/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  const targetId = req.params.id;
  const tempPassword = req.body?.new_password || generateTempPassword();

  const { data: target } = await supabase
    .from(TABLES.users)
    .select('id')
    .eq('id', targetId)
    .maybeSingle();

  if (!target) throw ApiError.notFound('That user could not be found.');

  const { error } = await supabase
    .from(TABLES.users)
    .update({ password_hash: await hashPassword(tempPassword) })
    .eq('id', targetId);

  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'user.reset_password', entity: 'users', entityId: targetId });

  res.json({
    success: true,
    message: 'Password reset. Share the temporary password with the user securely.',
    data: { temporary_password: tempPassword },
  });
});

/** DELETE /api/users/:id — deactivates rather than destroying booking history. */
export const deleteUser = asyncHandler(async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.user.id) {
    throw ApiError.forbidden('You cannot deactivate your own account.');
  }

  const { data: target } = await supabase
    .from(TABLES.users)
    .select('id, role')
    .eq('id', targetId)
    .maybeSingle();

  if (!target) throw ApiError.notFound('That user could not be found.');

  if (target.role === 'admin') {
    const { count } = await supabase
      .from(TABLES.users)
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active');
    if ((count ?? 0) <= 1) {
      throw ApiError.conflict('The system must keep at least one active administrator.');
    }
  }

  const { error } = await supabase
    .from(TABLES.users)
    .update({ status: 'inactive' })
    .eq('id', targetId);

  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'user.deactivate', entity: 'users', entityId: targetId });
  res.json({ success: true, message: 'User deactivated.' });
});

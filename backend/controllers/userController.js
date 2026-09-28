import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { hashPassword, generateTempPassword } from '../utils/password.js';
import { recordAudit } from '../services/auditService.js';
import { generateQrCode, roleNeedsQrCode } from '../utils/qrCode.js';
import { PUBLIC_FIELDS } from '../utils/userFields.js';
import { labToday } from '../utils/labTime.js';
import { isAdminLike, isSuperAdmin, manageableRoles, canManageRole } from '../utils/roles.js';

// ---------------------------------------------------------------------
// Who may act on whom
//
// Administrator accounts belong to the super admin. A plain admin runs the
// laboratory — computers, bookings, faculty and students — and cannot read,
// edit or create an account at its own level or above. Every refusal is
// audited, because an admin reaching for an admin account is worth a record
// whether or not it succeeded.
// ---------------------------------------------------------------------

/** Refuses, and logs, when the actor may not touch an account of this role. */
async function assertCanActOn(req, target) {
  if (canManageRole(req.user.role, target.role)) return;

  await recordAudit(req, {
    action: 'admin.permission_denied',
    entity: 'users',
    entityId: target.id,
    details: { actor_role: req.user.role, target_role: target.role },
  });

  throw ApiError.forbidden('Only a super administrator can manage administrator accounts.');
}

/** Refuses, and logs, when the actor may not hand out this role. */
async function assertCanAssignRole(req, role, entityId = null) {
  if (!role || canManageRole(req.user.role, role)) return;

  await recordAudit(req, {
    action: 'admin.permission_denied',
    entity: 'users',
    entityId,
    details: { actor_role: req.user.role, attempted_role: role },
  });

  throw ApiError.forbidden('Only a super administrator can grant administrator access.');
}

const countActive = async (role) => {
  const { count } = await supabase
    .from(TABLES.users)
    .select('id', { count: 'exact', head: true })
    .eq('role', role)
    .eq('status', 'active');
  return count ?? 0;
};

/**
 * Stops the system being left without somebody who can administer it.
 *
 * The invariant that matters is the last active super admin: demote,
 * deactivate or delete them and nobody can ever appoint another. The last
 * plain admin only matters when there is no super admin above them, since
 * a super admin can always appoint a replacement.
 */
async function assertAdminSurvives(target, { nextRole, nextStatus } = {}) {
  const staysActive = nextStatus ? nextStatus === 'active' : true;

  if (isSuperAdmin(target.role)) {
    const staysSuper = nextRole ? isSuperAdmin(nextRole) : true;
    if (staysSuper && staysActive) return;

    if ((await countActive('super_admin')) <= 1) {
      throw ApiError.conflict('The system must keep at least one active super administrator.');
    }
    return;
  }

  if (target.role === 'admin') {
    const staysAdminLike = nextRole ? isAdminLike(nextRole) : true;
    if (staysAdminLike && staysActive) return;

    const [admins, supers] = await Promise.all([countActive('admin'), countActive('super_admin')]);
    if (admins <= 1 && supers === 0) {
      throw ApiError.conflict('The system must keep at least one active administrator.');
    }
  }
}

/** GET /api/users — administrators only, paginated and filterable. */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, role, roles, status, sort, order } = req.query;
  const { from, to } = getPagination({ page, limit });

  // A plain admin sees faculty and students only. Enforced here and not
  // just in the React filter, so asking for ?role=admin by hand changes
  // nothing about what comes back.
  const visibleRoles = manageableRoles(req.user.role);
  const requestedRoles = roles?.length ? roles : role ? [role] : null;

  if (requestedRoles && requestedRoles.some((item) => !visibleRoles.includes(item))) {
    await recordAudit(req, {
      action: 'admin.permission_denied',
      entity: 'users',
      details: { actor_role: req.user.role, attempted_filter: requestedRoles },
    });
    throw ApiError.forbidden('Only a super administrator can view administrator accounts.');
  }

  let query = supabase.from(TABLES.users).select(PUBLIC_FIELDS, { count: 'exact' });

  if (requestedRoles) query = query.in('role', requestedRoles);
  else if (!isSuperAdmin(req.user.role)) query = query.in('role', visibleRoles);

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
    ['super_admin', 'admin', 'faculty', 'student'].map((role) =>
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
      super_admins: counts[0].count ?? 0,
      // Both administrator roles, so a dashboard tile counting "admins"
      // does not quietly omit the person at the top of the hierarchy.
      admins: (counts[0].count ?? 0) + (counts[1].count ?? 0),
      faculty: counts[2].count ?? 0,
      students: counts[3].count ?? 0,
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

  // Reading an administrator's record is itself an administrator action.
  if (data.id !== req.user.id) await assertCanActOn(req, data);

  const { count: bookingCount } = await supabase
    .from(TABLES.bookings)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', data.id);

  res.json({ success: true, data: { ...data, booking_count: bookingCount ?? 0 } });
});

/**
 * GET /api/users/by-qr/:code
 *
 * Resolves a scanned laboratory card to the person holding it, together
 * with whatever they have booked today — what a scanner at the door needs.
 * Admin only: a scan identifies a real student, so it is not public.
 */
export const lookupByQrCode = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^SL-[0-9A-F]{12}$/.test(code)) {
    throw ApiError.badRequest('That is not a valid SMARTLAB card code.');
  }

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .select(PUBLIC_FIELDS)
    .eq('qr_code', code)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!user) throw ApiError.notFound('No account matches that card.');

  const today = labToday();
  const { data: bookings } = await supabase
    .from(TABLES.bookings)
    .select('id, booking_date, start_time, end_time, status, subject, computer:computers ( name )')
    .eq('user_id', user.id)
    .eq('booking_date', today)
    .in('status', ['PENDING', 'APPROVED'])
    .order('start_time');

  await recordAudit(req, { action: 'user.qr_scan', entity: 'users', entityId: user.id });

  res.json({
    success: true,
    data: {
      user,
      today_bookings: (bookings ?? []).map((b) => ({
        ...b,
        computer: Array.isArray(b.computer) ? b.computer[0] : b.computer,
      })),
    },
  });
});

/**
 * POST /api/users/:id/reissue-qr
 * Issues a fresh card code, which invalidates any previously printed one.
 */
export const reissueQrCode = asyncHandler(async (req, res) => {
  const { data: target } = await supabase
    .from(TABLES.users)
    .select('id, role')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!target) throw ApiError.notFound('That user could not be found.');
  if (!roleNeedsQrCode(target.role)) {
    throw ApiError.badRequest('Only students and faculty carry a laboratory card.');
  }

  const { data, error } = await supabase
    .from(TABLES.users)
    .update({ qr_code: generateQrCode() })
    .eq('id', target.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'user.qr_reissue', entity: 'users', entityId: target.id });
  res.json({ success: true, data });
});

/** POST /api/users */
export const createUser = asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;

  await assertCanAssignRole(req, rest.role);

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
      course: rest.course || null,
      id_number: rest.id_number || null,
      phone: rest.phone || null,
      password_hash: await hashPassword(password),
      qr_code: roleNeedsQrCode(rest.role) ? generateQrCode() : null,
    })
    .select(PUBLIC_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('An account with that email already exists.');
    throw ApiError.internal();
  }

  await recordAudit(req, {
    action: isAdminLike(data.role) ? 'admin.create' : 'user.create',
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

  // An admin may not edit an account at its own level or above, and may not
  // promote anybody into one.
  await assertCanActOn(req, target);
  await assertCanAssignRole(req, patch.role, targetId);

  // Guard rails on self-edits: an administrator cannot demote or deactivate
  // the account they are signed in with, which would lock them out
  // mid-session.
  if (targetId === req.user.id) {
    if (patch.role && patch.role !== target.role) {
      throw ApiError.forbidden('You cannot change your own role.');
    }
    if (patch.status && patch.status !== 'active') {
      throw ApiError.forbidden('You cannot deactivate your own account.');
    }
  }

  await assertAdminSurvives(target, { nextRole: patch.role, nextStatus: patch.status });

  if (patch.email && patch.email !== target.email) {
    const { data: clash } = await supabase
      .from(TABLES.users)
      .select('id')
      .eq('email', patch.email)
      .neq('id', targetId)
      .maybeSingle();
    if (clash) throw ApiError.conflict('An account with that email already exists.');
  }

  for (const key of ['department', 'course', 'id_number', 'phone']) {
    if (patch[key] === '') patch[key] = null;
  }

  const { data, error } = await supabase
    .from(TABLES.users)
    .update(patch)
    .eq('id', targetId)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) throw ApiError.internal();

  const touchesAdmin = isAdminLike(target.role) || isAdminLike(data.role);

  await recordAudit(req, {
    action: touchesAdmin ? 'admin.update' : 'user.update',
    entity: 'users',
    entityId: targetId,
    details: patch,
  });

  // A role change is the entry worth finding later, so it gets its own
  // line rather than hiding inside the details of an update.
  if (patch.role && patch.role !== target.role) {
    await recordAudit(req, {
      action: touchesAdmin ? 'admin.role_change' : 'user.role_change',
      entity: 'users',
      entityId: targetId,
      details: { from: target.role, to: patch.role },
    });
  }

  res.json({ success: true, data });
});

/** POST /api/users/:id/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  const targetId = req.params.id;
  const tempPassword = req.body?.new_password || generateTempPassword();

  const { data: target } = await supabase
    .from(TABLES.users)
    .select('id, role')
    .eq('id', targetId)
    .maybeSingle();

  if (!target) throw ApiError.notFound('That user could not be found.');

  await assertCanActOn(req, target);

  const { error } = await supabase
    .from(TABLES.users)
    .update({ password_hash: await hashPassword(tempPassword) })
    .eq('id', targetId);

  if (error) throw ApiError.internal();

  await recordAudit(req, {
    action: isAdminLike(target.role) ? 'admin.reset_password' : 'user.reset_password',
    entity: 'users',
    entityId: targetId,
  });

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

  await assertCanActOn(req, target);
  await assertAdminSurvives(target, { nextStatus: 'inactive' });

  const { error } = await supabase
    .from(TABLES.users)
    .update({ status: 'inactive' })
    .eq('id', targetId);

  if (error) throw ApiError.internal();

  await recordAudit(req, {
    action: isAdminLike(target.role) ? 'admin.deactivate' : 'user.deactivate',
    entity: 'users',
    entityId: targetId,
  });
  res.json({ success: true, message: 'User deactivated.' });
});

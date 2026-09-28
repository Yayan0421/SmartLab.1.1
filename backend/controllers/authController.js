import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { recordAudit } from '../services/auditService.js';
import { isAdminLike } from '../utils/roles.js';
import { uploadAvatar, deleteAvatar } from '../services/avatarService.js';
import { PUBLIC_FIELDS } from '../utils/userFields.js';

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password, portal } = req.body;

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .select(`${PUBLIC_FIELDS}, password_hash`)
    .eq('email', email)
    .maybeSingle();

  if (error) throw ApiError.internal();

  // One message for "no such user" and "wrong password" so the endpoint
  // cannot be used to discover which email addresses are registered.
  const invalid = ApiError.unauthorized('Invalid email or password.');
  if (!user) {
    await comparePassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }

  const matches = await comparePassword(password, user.password_hash);
  if (!matches) throw invalid;

  if (user.status !== 'active') {
    throw ApiError.forbidden('Your account is not active. Please contact an administrator.');
  }

  // Keep the two portals separate. Checked here rather than in React so
  // posting straight to the API cannot cross the boundary either.
  if (portal === 'admin' && !isAdminLike(user.role)) {
    throw ApiError.forbidden(
      'This sign-in is for administrators. Please use the student and faculty sign-in page.'
    );
  }
  if (portal === 'public' && isAdminLike(user.role)) {
    throw ApiError.forbidden(
      'Administrators sign in through the administrator portal at /admin/login.'
    );
  }

  const { password_hash: _ignored, ...safeUser } = user;

  await supabase
    .from(TABLES.users)
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id);

  const token = signToken(safeUser);
  req.user = safeUser;
  await recordAudit(req, { action: 'auth.login', entity: 'users', entityId: user.id });

  res.json({ success: true, data: { token, user: safeUser } });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

/**
 * POST /api/auth/logout
 * JWTs are stateless, so this records the event and lets the client discard
 * the token. Kept as an endpoint so the audit trail stays complete.
 */
export const logout = asyncHandler(async (req, res) => {
  await recordAudit(req, { action: 'auth.logout', entity: 'users', entityId: req.user.id });
  res.json({ success: true, message: 'Signed out.' });
});

/** PATCH /api/auth/profile */
export const updateProfile = asyncHandler(async (req, res) => {
  const patch = {};
  // Programme and course are not in this list on purpose — see
  // updateProfileSchema. Changing them is an administrator action.
  for (const key of ['full_name', 'id_number', 'phone']) {
    if (req.body[key] !== undefined) patch[key] = req.body[key] || null;
  }

  if (!Object.keys(patch).length) throw ApiError.badRequest('Nothing to update.');

  const { data, error } = await supabase
    .from(TABLES.users)
    .update(patch)
    .eq('id', req.user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'profile.update', entity: 'users', entityId: req.user.id });
  res.json({ success: true, data });
});

/**
 * POST /api/auth/avatar
 * Replaces the caller's profile picture. Only ever acts on req.user.id, so
 * nobody can set someone else's photo.
 */
export const setAvatar = asyncHandler(async (req, res) => {
  const url = await uploadAvatar(req.user.id, req.body.image);

  const { data, error } = await supabase
    .from(TABLES.users)
    .update({ avatar_url: url })
    .eq('id', req.user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'profile.avatar_set', entity: 'users', entityId: req.user.id });
  res.json({ success: true, data });
});

/** DELETE /api/auth/avatar */
export const removeAvatar = asyncHandler(async (req, res) => {
  await deleteAvatar(req.user.id);

  const { data, error } = await supabase
    .from(TABLES.users)
    .update({ avatar_url: null })
    .eq('id', req.user.id)
    .select(PUBLIC_FIELDS)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'profile.avatar_removed', entity: 'users', entityId: req.user.id });
  res.json({ success: true, data });
});

/** POST /api/auth/change-password */
export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .select('id, password_hash')
    .eq('id', req.user.id)
    .single();

  if (error || !user) throw ApiError.internal();

  const matches = await comparePassword(current_password, user.password_hash);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect.');

  await supabase
    .from(TABLES.users)
    .update({ password_hash: await hashPassword(new_password) })
    .eq('id', user.id);

  await recordAudit(req, { action: 'auth.change_password', entity: 'users', entityId: user.id });
  res.json({ success: true, message: 'Password updated.' });
});

export { PUBLIC_FIELDS };

import { timingSafeEqual } from 'node:crypto';
import { supabase, TABLES } from '../config/database.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { recordAudit } from '../services/auditService.js';

const PUBLIC_FIELDS =
  'id, full_name, email, role, status, department, id_number, phone, last_login_at, created_at';

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
  if (portal === 'admin' && user.role !== 'admin') {
    throw ApiError.forbidden(
      'This sign-in is for administrators. Please use the student and faculty sign-in page.'
    );
  }
  if (portal === 'public' && user.role === 'admin') {
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

/** POST /api/auth/register — self-service signup for faculty and students. */
export const register = asyncHandler(async (req, res) => {
  const { full_name, email, password, role, department, id_number, phone } = req.body;

  const { data: existing } = await supabase
    .from(TABLES.users)
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) throw ApiError.conflict('An account with that email already exists.');

  const password_hash = await hashPassword(password);

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .insert({
      full_name,
      email,
      password_hash,
      role,
      status: 'active',
      department: department || null,
      id_number: id_number || null,
      phone: phone || null,
    })
    .select(PUBLIC_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('An account with that email already exists.');
    throw ApiError.internal();
  }

  const token = signToken(user);
  req.user = user;
  await recordAudit(req, { action: 'auth.register', entity: 'users', entityId: user.id, details: { role } });

  res.status(201).json({ success: true, data: { token, user } });
});

/**
 * POST /api/auth/register-admin
 *
 * Administrator signup, gated by ADMIN_SIGNUP_CODE. Without a configured
 * code the endpoint stays closed, so an unconfigured deployment cannot be
 * used to create administrators.
 */
export const registerAdmin = asyncHandler(async (req, res) => {
  const { full_name, email, password, admin_code, department, id_number } = req.body;

  if (!env.adminSignupCode) {
    throw ApiError.forbidden(
      'Administrator signup is disabled. Ask an existing administrator to create your account.'
    );
  }

  // Compared in constant time so the endpoint cannot be used to guess the
  // code one character at a time.
  const provided = Buffer.from(String(admin_code));
  const expected = Buffer.from(env.adminSignupCode);
  const valid =
    provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!valid) {
    await recordAudit(req, {
      action: 'auth.admin_signup_denied',
      entity: 'users',
      details: { email },
    });
    throw ApiError.forbidden('That administrator code is not valid.');
  }

  const { data: existing } = await supabase
    .from(TABLES.users)
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) throw ApiError.conflict('An account with that email already exists.');

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .insert({
      full_name,
      email,
      password_hash: await hashPassword(password),
      role: 'admin',
      status: 'active',
      department: department || null,
      id_number: id_number || null,
    })
    .select(PUBLIC_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('An account with that email already exists.');
    throw ApiError.internal();
  }

  const token = signToken(user);
  req.user = user;
  await recordAudit(req, { action: 'auth.admin_register', entity: 'users', entityId: user.id });

  res.status(201).json({ success: true, data: { token, user } });
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
  for (const key of ['full_name', 'department', 'id_number', 'phone']) {
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

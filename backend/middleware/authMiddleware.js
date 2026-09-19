import { supabase, TABLES } from '../config/database.js';
import { verifyToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import env from '../config/env.js';
import { PUBLIC_FIELDS } from '../utils/userFields.js';

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Verifies the JWT, then re-loads the user from the database.
 *
 * Re-reading matters: the role and status in the token are a snapshot from
 * sign-in time. A deactivated account or a demoted admin must lose access
 * on the very next request, not when the token expires.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = readBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('You must be signed in to perform this action.');
  }

  const payload = verifyToken(token);

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .select(PUBLIC_FIELDS)
    .eq('id', payload.sub)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!user) throw ApiError.unauthorized('Your account no longer exists.');
  if (user.status !== 'active') {
    throw ApiError.forbidden('Your account is not active. Please contact an administrator.');
  }

  req.user = user;
  req.token = token;
  next();
});

/**
 * Authenticates the monitoring agent running on each laboratory PC.
 * Agents post telemetry with a shared key rather than a user session.
 */
export function authenticateAgent(req, _res, next) {
  const key = req.headers['x-agent-key'];
  if (!env.agentApiKey) {
    return next(ApiError.internal('Monitoring agent key is not configured on the server.'));
  }
  if (!key || key !== env.agentApiKey) {
    return next(ApiError.unauthorized('Invalid monitoring agent credentials.'));
  }
  next();
}

export default { authenticate, authenticateAgent };

import ApiError from '../utils/ApiError.js';

/**
 * Restricts a route to the listed roles. Always used *after* authenticate,
 * so req.user reflects the database and not just the token payload.
 *
 *   router.get('/', authenticate, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return function guard(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireStaff = requireRole('admin', 'faculty');
export const requireAnyRole = requireRole('admin', 'faculty', 'student');

/** True when the actor is an admin or is acting on their own record. */
export function isSelfOrAdmin(req, targetUserId) {
  return req.user?.role === 'admin' || req.user?.id === targetUserId;
}

export default { requireRole, requireAdmin, requireStaff, requireAnyRole, isSelfOrAdmin };

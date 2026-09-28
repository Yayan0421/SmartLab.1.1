import ApiError from '../utils/ApiError.js';
import { ADMIN_LIKE, isAdminLike } from '../utils/roles.js';

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

// A super admin can do everything an admin can, so it passes every guard an
// admin passes. The narrower requireSuperAdmin is what protects the screens
// that own the system: administrators, settings and the audit trail.
export const requireAdmin = requireRole(ADMIN_LIKE);
export const requireSuperAdmin = requireRole('super_admin');
export const requireStaff = requireRole(ADMIN_LIKE, 'faculty');
export const requireAnyRole = requireRole(ADMIN_LIKE, 'faculty', 'student');

/** True when the actor is an administrator or is acting on their own record. */
export function isSelfOrAdmin(req, targetUserId) {
  return isAdminLike(req.user?.role) || req.user?.id === targetUserId;
}

export default {
  requireRole,
  requireAdmin,
  requireSuperAdmin,
  requireStaff,
  requireAnyRole,
  isSelfOrAdmin,
};

/**
 * The role hierarchy in one place.
 *
 *   super_admin -> admin -> faculty / student
 *
 * A super admin can do everything an admin can, plus the things that own
 * the system itself: administrator accounts, settings and the audit trail.
 * That "plus" is why almost every check wants `isAdminLike` rather than a
 * comparison against the literal 'admin' — a super admin sitting in an
 * admin screen is still an administrator.
 *
 * Kept in utils rather than in the role middleware so services can import
 * it without pulling Express concerns in behind it.
 */

export const SUPER_ADMIN = 'super_admin';
export const ADMIN = 'admin';
export const FACULTY = 'faculty';
export const STUDENT = 'student';

/** Both administrator roles, for `.in()` filters and route guards. */
export const ADMIN_LIKE = [ADMIN, SUPER_ADMIN];

/** Everyone who is not an administrator. */
export const NON_ADMIN = [FACULTY, STUDENT];

/** Every role, highest first. */
export const ALL_ROLES = [SUPER_ADMIN, ADMIN, FACULTY, STUDENT];

/** True for an admin or a super admin. */
export function isAdminLike(role) {
  return role === ADMIN || role === SUPER_ADMIN;
}

/** True only for the owner role. */
export function isSuperAdmin(role) {
  return role === SUPER_ADMIN;
}

/**
 * The roles an actor is allowed to see and act on.
 *
 * A super admin manages everybody. A plain admin manages faculty and
 * students only: administrator accounts are the super admin's to hand out,
 * so an admin can neither read them, edit them, nor promote anyone into
 * them.
 */
export function manageableRoles(actorRole) {
  return isSuperAdmin(actorRole) ? ALL_ROLES : NON_ADMIN;
}

/** True when `actorRole` may create or modify an account holding `targetRole`. */
export function canManageRole(actorRole, targetRole) {
  return manageableRoles(actorRole).includes(targetRole);
}

export default {
  SUPER_ADMIN,
  ADMIN,
  FACULTY,
  STUDENT,
  ADMIN_LIKE,
  NON_ADMIN,
  ALL_ROLES,
  isAdminLike,
  isSuperAdmin,
  manageableRoles,
  canManageRole,
};

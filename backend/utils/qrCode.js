import { randomBytes } from 'node:crypto';

/**
 * Identity codes printed as QR on a student or faculty card.
 *
 * Opaque and random rather than derived from the user id, so a printed card
 * exposes nothing about the system and can be reissued on its own if lost.
 * 12 hex characters is 48 bits — far more than a laboratory of a few
 * thousand people needs, with no realistic chance of collision.
 */
export function generateQrCode() {
  return `SL-${randomBytes(6).toString('hex').toUpperCase()}`;
}

/** Administrators do not carry a scannable card; only bookable roles do. */
export function roleNeedsQrCode(role) {
  return role === 'student' || role === 'faculty';
}

export default { generateQrCode, roleNeedsQrCode };

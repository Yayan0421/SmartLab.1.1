import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Readable temporary password for admin-issued resets. */
export function generateTempPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set, n) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return `Lab${pick(letters, 4)}${pick(digits, 4)}!`;
}

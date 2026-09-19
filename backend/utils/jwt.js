import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from './ApiError.js';

/**
 * The token carries only the identity claims. Role is re-read from the
 * database on every request, so a role change or deactivation takes effect
 * immediately rather than when the token expires.
 */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: 'smartlab' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret, { issuer: 'smartlab' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    throw ApiError.unauthorized('Your session is not valid. Please sign in again.');
  }
}

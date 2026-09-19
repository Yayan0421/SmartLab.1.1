import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.originalUrl}`));
}

/**
 * The single place errors become responses.
 *
 * Only ApiError and validation errors have their message shown to the user.
 * Anything else (including raw Supabase/Postgres errors) is logged in full
 * and reported as a generic 500, so schema details never leak.
 */
export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    const fields = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'form';
      if (!fields[path]) fields[path] = issue.message;
    }
    return res.status(400).json({
      success: false,
      message: 'Please correct the highlighted fields.',
      errors: fields,
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.details ? { errors: error.details } : {}),
    });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, error);

  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    ...(env.isProduction ? {} : { debug: error.message }),
  });
}

export default { notFoundHandler, errorHandler };

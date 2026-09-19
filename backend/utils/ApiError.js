/**
 * Errors thrown with ApiError carry a status and a message that is safe to
 * show a normal user. Anything else that reaches the error middleware is
 * reported as a generic 500 so raw database errors never leak.
 */
export default class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.expose = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'The request could not be processed.', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Your session has expired. Please sign in again.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'The requested item could not be found.') {
    return new ApiError(404, message);
  }

  static conflict(message = 'That action conflicts with existing data.', details) {
    return new ApiError(409, message, details);
  }

  static tooMany(message = 'Too many requests. Please slow down and try again.') {
    return new ApiError(429, message);
  }

  static internal(message = 'Something went wrong. Please try again.') {
    return new ApiError(500, message);
  }
}

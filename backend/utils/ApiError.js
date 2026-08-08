/**
 * Standardized application error.
 * Thrown from anywhere in the request lifecycle and caught by the
 * global error handler, which always replies with { message, details? }.
 */
export default class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }
}

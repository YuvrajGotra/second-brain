/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Anything thrown that is NOT an AppError is treated as an unexpected 500 and
 * its message is never sent to the client.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }
  static conflict(message) {
    return new AppError(409, 'CONFLICT', message);
  }
  static payloadTooLarge(message) {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
  }
  static unprocessable(message, details) {
    return new AppError(422, 'UNPROCESSABLE_CONTENT', message, details);
  }
  static upstream(message = 'The AI service is temporarily unavailable. Please try again.') {
    return new AppError(502, 'AI_SERVICE_ERROR', message);
  }
}

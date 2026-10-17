import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

/** Translate known library/database errors into AppErrors with safe messages. */
function normalise(err) {
  if (err instanceof AppError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return AppError.payloadTooLarge(`File is too large. Maximum size is ${env.MAX_UPLOAD_MB} MB.`);
    }
    return AppError.badRequest(err.message);
  }

  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Request body is not valid JSON');
  if (err.type === 'entity.too.large') return AppError.payloadTooLarge('Request body is too large');

  // PostgreSQL error codes
  switch (err.code) {
    case '23505':
      return AppError.conflict('A record with these details already exists');
    case '23503':
      return AppError.badRequest('Referenced record does not exist');
    case '22P02':
      return AppError.badRequest('Invalid identifier format');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const appError = normalise(err);

  if (!appError) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  } else if (appError.status >= 500) {
    logger.error(`${appError.code} on ${req.method} ${req.originalUrl}:`, err.cause || err.message);
  }

  const status = appError?.status ?? 500;
  const body = {
    success: false,
    error: {
      code: appError?.code ?? 'INTERNAL_ERROR',
      // Never leak internal error messages / stack traces for unexpected errors.
      message: appError?.message ?? 'Something went wrong on our side. Please try again.',
    },
  };
  if (appError?.details) body.error.details = appError.details;

  // Streaming responses may have already started (SSE chat).
  if (res.headersSent) return res.end();
  res.status(status).json(body);
}

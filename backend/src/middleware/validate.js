import { AppError } from '../utils/AppError.js';

/**
 * Validates req.body / req.params / req.query against zod schemas.
 * Parsed (and coerced/trimmed) values are exposed on req.validated so
 * controllers never touch raw, unvalidated input.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.validated = req.validated || {};
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.') || key,
        message: i.message,
      }));
      return next(AppError.badRequest(details[0]?.message || 'Invalid request', details));
    }
    req.validated[key] = result.data;
  }
  next();
};

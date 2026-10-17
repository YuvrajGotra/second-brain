import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import * as userModel from '../models/userModel.js';

export const AUTH_COOKIE = 'sb_token';

function extractToken(req) {
  // 1. httpOnly cookie (browser clients) — not readable by JavaScript, mitigates XSS token theft.
  if (req.cookies?.[AUTH_COOKIE]) return req.cookies[AUTH_COOKIE];
  // 2. Bearer header (API clients, tests, tools like Postman).
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verifies the JWT, loads the user and attaches { id, name, email } to req.user.
 * The user lookup ensures tokens for deleted accounts stop working immediately.
 */
export async function authenticateUser(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(AppError.unauthorized());

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid session';
    return next(AppError.unauthorized(message));
  }

  const user = await userModel.findById(payload.sub);
  if (!user) return next(AppError.unauthorized('Invalid session'));

  req.user = { id: user.id, name: user.name, email: user.email };
  next();
}

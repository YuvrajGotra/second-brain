import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const handler = (_req, res) =>
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down and try again shortly.' },
  });

const make = (windowMs, limit) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler, skip: () => env.isTest });

export const apiLimiter = make(60_000, 300);
/** Brute-force protection for login/register. */
export const authLimiter = make(15 * 60_000, 30);
/** LLM calls cost money — keep them bounded per client. */
export const aiLimiter = make(60_000, 30);
export const uploadLimiter = make(60_000, 20);

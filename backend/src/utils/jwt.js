import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'second-brain-api';

export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: ISSUER,
    algorithm: 'HS256',
  });
}

/** Returns the decoded payload or throws (expired / tampered / malformed). */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
}

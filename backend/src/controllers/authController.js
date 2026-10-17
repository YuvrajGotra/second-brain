import * as authService from '../services/authService.js';
import { AUTH_COOKIE } from '../middleware/authenticate.js';
import { env } from '../config/env.js';
import { ok, created } from '../utils/response.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE || env.isProd,
  sameSite: 'lax',
  path: '/',
};

const setAuthCookie = (res, token) => res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });

export async function register(req, res) {
  const { user, token } = await authService.register(req.validated.body);
  setAuthCookie(res, token);
  // The token is also returned for non-browser API clients; the web app relies on the cookie.
  created(res, { user, token });
}

export async function login(req, res) {
  const { user, token } = await authService.login(req.validated.body);
  setAuthCookie(res, token);
  ok(res, { user, token });
}

export function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  ok(res, { loggedOut: true });
}

export async function me(req, res) {
  ok(res, { user: await authService.getProfile(req.user.id) });
}

export async function updateProfile(req, res) {
  ok(res, { user: await authService.updateProfile(req.user.id, req.validated.body) });
}

export async function changePassword(req, res) {
  await authService.changePassword(req.user.id, req.validated.body);
  ok(res, { updated: true });
}

export async function deleteAccount(req, res) {
  await authService.deleteAccount(req.user.id, req.validated.body);
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  ok(res, { deleted: true });
}

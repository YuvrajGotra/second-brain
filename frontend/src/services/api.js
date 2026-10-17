import axios from 'axios';

/**
 * Shared axios instance. Auth is an httpOnly cookie, so no token handling is
 * needed here — `withCredentials` makes the browser send it.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 60_000,
});

const listeners = new Set();
/** Lets AuthContext react to any 401 (expired session) from anywhere in the app. */
export const onUnauthorized = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.startsWith('/auth/')) {
      listeners.forEach((fn) => fn());
    }
    return Promise.reject(error);
  },
);

const FRIENDLY = {
  400: 'Please check your input and try again.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  413: 'That file is too large.',
  422: "That file or content couldn't be processed.",
  429: "You're going a bit fast — please wait a moment.",
  502: 'The AI service is temporarily unavailable.',
};

/** Turn any error (axios, fetch, network) into a short message safe to show users. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running?';
  if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  const status = error.response?.status ?? error.status;
  const serverMessage = error.response?.data?.error?.message ?? error.serverMessage;
  if (serverMessage && status && status < 500) return serverMessage;
  if (serverMessage && status === 502) return serverMessage;
  return FRIENDLY[status] ?? (status >= 500 ? 'Something went wrong on our side. Please try again.' : fallback);
}

/** Unwrap the { success, data, meta } envelope. */
export const unwrap = (res) => res.data.data;
export const unwrapList = (res) => ({ items: res.data.data, meta: res.data.meta });

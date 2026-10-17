import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const root = path.resolve(env.UPLOAD_DIR);

/** Files are stored as uploads/<userId>/<random>.<ext> — never using the client-supplied name. */
export async function userDir(userId) {
  const dir = path.join(root, userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function randomFileName(originalName) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${crypto.randomUUID()}${ext}`;
}

/** Resolve a stored relative path and guarantee it stays inside the upload root. */
export function resolveStoredPath(storagePath) {
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage path');
  return full;
}

export function toStoredPath(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

export async function removeFile(storagePath) {
  try {
    await fs.unlink(resolveStoredPath(storagePath));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`Could not delete file ${storagePath}: ${err.message}`);
  }
}

export async function removeAllUserFiles(userId) {
  await fs.rm(path.join(root, userId), { recursive: true, force: true }).catch(() => {});
}

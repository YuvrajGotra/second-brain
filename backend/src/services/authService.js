import bcrypt from 'bcryptjs';
import * as userModel from '../models/userModel.js';
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/jwt.js';
import { removeAllUserFiles } from './storageService.js';

const BCRYPT_ROUNDS = 12;
// Pre-computed hash used to keep login timing constant when the email doesn't exist.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-guard', BCRYPT_ROUNDS);

export async function register({ name, email, password }) {
  const existing = await userModel.findByEmailWithHash(email);
  if (existing) throw AppError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await userModel.create({ name, email, passwordHash });
  return { user, token: signAccessToken(user.id) };
}

export async function login({ email, password }) {
  const record = await userModel.findByEmailWithHash(email);
  const valid = await bcrypt.compare(password, record?.password_hash ?? DUMMY_HASH);
  // Same message for unknown email and wrong password — don't reveal which accounts exist.
  if (!record || !valid) throw AppError.unauthorized('Invalid email or password');

  const { password_hash: _omit, ...user } = record;
  return { user, token: signAccessToken(user.id) };
}

export async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw AppError.notFound('User');
  return user;
}

export async function updateProfile(userId, { name }) {
  return userModel.updateName(userId, name);
}

async function assertPassword(userId, password) {
  const hash = await userModel.findHashById(userId);
  if (!hash || !(await bcrypt.compare(password, hash))) {
    throw AppError.badRequest('Current password is incorrect');
  }
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  await assertPassword(userId, currentPassword);
  await userModel.updatePasswordHash(userId, await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
}

/** Deletes the account; ON DELETE CASCADE removes documents, chunks, notes and chats. */
export async function deleteAccount(userId, { password }) {
  await assertPassword(userId, password);
  await userModel.remove(userId);
  await removeAllUserFiles(userId);
}

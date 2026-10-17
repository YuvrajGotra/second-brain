import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address').max(254));
const name = z.string().trim().min(1, 'Name is required').max(100, 'Name is too long');
// bcrypt only uses the first 72 bytes, so cap length to avoid silent truncation.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({ name, email, password });
export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(200) });
export const updateProfileSchema = z.object({ name });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: password,
});
export const deleteAccountSchema = z.object({ password: z.string().min(1, 'Password is required').max(200) });

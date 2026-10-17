// Creates backend/.env from .env.example with a freshly generated JWT secret.
// Without a GEMINI_API_KEY it starts in offline "mock" mode so the app runs immediately.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

if (fs.existsSync(target)) {
  console.log('backend/.env already exists — leaving it unchanged.');
  process.exit(0);
}

let env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
env = env.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`);
env = env.replace(/^AI_PROVIDER=.*$/m, 'AI_PROVIDER=mock');
fs.writeFileSync(target, env);
console.log('Created backend/.env (offline mock AI). Add GEMINI_API_KEY and set AI_PROVIDER=gemini for real answers.');

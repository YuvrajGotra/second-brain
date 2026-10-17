import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const bool = (fallback) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DB_AUTO_MIGRATE: bool(true),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    COOKIE_SECURE: bool(false),

    UPLOAD_DIR: z.string().default(path.join(backendRoot, 'uploads')),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(20),

    // AI provider: "gemini" for real usage, "mock" for tests/offline demos.
    AI_PROVIDER: z.enum(['gemini', 'mock']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_CHAT_MODEL: z.string().default('gemini-3.5-flash'),
    GEMINI_FAST_MODEL: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

    CHUNK_SIZE: z.coerce.number().int().min(200).default(1000),
    CHUNK_OVERLAP: z.coerce.number().int().min(0).default(150),

    RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
    RAG_CANDIDATES: z.coerce.number().int().min(1).max(100).default(24),
    RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.3),
    RAG_RERANK: bool(true),
    RAG_QUERY_REWRITE: bool(true),
    RAG_HISTORY_MESSAGES: z.coerce.number().int().min(0).max(30).default(6),

    WORKER_ENABLED: bool(true),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
    WORKER_POLL_MS: z.coerce.number().int().min(100).default(1500),
  })
  .refine((e) => e.CHUNK_OVERLAP < e.CHUNK_SIZE / 2, {
    message: 'CHUNK_OVERLAP must be less than half of CHUNK_SIZE',
    path: ['CHUNK_OVERLAP'],
  })
  .refine((e) => e.AI_PROVIDER !== 'gemini' || Boolean(e.GEMINI_API_KEY), {
    message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini (or set AI_PROVIDER=mock)',
    path: ['GEMINI_API_KEY'],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}\nSee backend/.env.example`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  maxUploadBytes: Math.round(parsed.data.MAX_UPLOAD_MB * 1024 * 1024),
});

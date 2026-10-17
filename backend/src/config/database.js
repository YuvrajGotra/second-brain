import pg from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => logger.error('Unexpected idle PostgreSQL client error', err));

/** Run a parameterised query. All SQL in the app goes through here or a transaction client. */
export function query(text, params = []) {
  return pool.query(text, params);
}

/** Run `fn(client)` inside a transaction; rolls back on any thrown error. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Serialise a JS number array into pgvector's text format: '[0.1,0.2,...]'. */
export function toVector(values) {
  return `[${values.join(',')}]`;
}

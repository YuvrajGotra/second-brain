import { env } from './config/env.js';
import { pool } from './config/database.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { startIngestionWorker, stopIngestionWorker } from './workers/ingestionWorker.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    logger.error(`Cannot connect to PostgreSQL (${err.message}). Is the database running? Try: docker compose up -d`);
    process.exit(1);
  }

  if (env.DB_AUTO_MIGRATE) await runMigrations();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`Second Brain API listening on http://localhost:${env.PORT} (AI provider: ${env.AI_PROVIDER})`);
  });

  if (env.WORKER_ENABLED) startIngestionWorker();

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down…`);
    server.close();
    await stopIngestionWorker();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});

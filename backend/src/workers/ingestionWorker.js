import { EventEmitter } from 'node:events';
import { env } from '../config/env.js';
import * as jobModel from '../models/jobModel.js';
import { processDocument, processNote, markFailed } from '../services/ingestionService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Background ingestion worker backed by the ingestion_jobs table.
 *
 * Uploads return immediately (202) and the heavy work — extraction, chunking,
 * embedding — happens here. Because the queue lives in PostgreSQL, jobs
 * survive restarts, failed jobs retry with exponential backoff, and multiple
 * server instances can share the work safely (FOR UPDATE SKIP LOCKED).
 */
const wakeups = new EventEmitter();
let running = false;
let loops = [];

/** Called after enqueueing so new jobs start instantly instead of on the next poll. */
export function notifyNewJob() {
  wakeups.emit('job');
}

function waitForWork(ms) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      wakeups.off('job', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    wakeups.once('job', done);
  });
}

/** Process a single job. Exported so tests can drive the queue deterministically. */
export async function runJob(job) {
  try {
    if (job.document_id) await processDocument(job.document_id);
    else await processNote(job.note_id);
    await jobModel.complete(job.id);
  } catch (err) {
    // Content problems (bad/empty file) will never succeed — don't retry them.
    const permanent = err instanceof AppError && err.status === 422;
    const message = err instanceof AppError ? err.message : 'Processing failed due to an internal error.';
    if (!(err instanceof AppError)) logger.error(`Ingestion job ${job.id} failed:`, err);

    const willRetry = permanent ? false : await jobModel.fail(job, err.message || String(err));
    if (permanent) await jobModel.fail({ ...job, attempts: job.max_attempts }, message);
    if (!willRetry) await markFailed(job, message);
    else logger.warn(`Ingestion job ${job.id} will retry (attempt ${job.attempts}/${job.max_attempts})`);
  }
}

/** Drain every runnable job right now (used by tests and the CLI). */
export async function drainQueue() {
  let job;
  while ((job = await jobModel.claimNext())) await runJob(job);
}

async function loop() {
  while (running) {
    try {
      const job = await jobModel.claimNext();
      if (job) await runJob(job);
      else await waitForWork(env.WORKER_POLL_MS);
    } catch (err) {
      logger.error('Ingestion worker error:', err.message);
      await waitForWork(env.WORKER_POLL_MS * 2);
    }
  }
}

export async function startIngestionWorker() {
  if (running) return;
  running = true;
  const recovered = await jobModel.recoverStale().catch(() => 0);
  if (recovered) logger.warn(`Re-queued ${recovered} stale ingestion job(s)`);
  jobModel.purgeOld().catch(() => {});
  loops = Array.from({ length: env.WORKER_CONCURRENCY }, () => loop());
  logger.info(`Ingestion worker started (concurrency ${env.WORKER_CONCURRENCY})`);
}

export async function stopIngestionWorker() {
  running = false;
  wakeups.emit('job');
  await Promise.allSettled(loops);
}

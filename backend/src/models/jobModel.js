import { query } from '../config/database.js';

export async function enqueue(client, { userId, documentId = null, noteId = null }) {
  // Supersede any pending job for the same note (rapid successive edits → one re-index).
  if (noteId) {
    await client.query(`DELETE FROM ingestion_jobs WHERE note_id = $1 AND status = 'pending'`, [noteId]);
  }
  await client.query('INSERT INTO ingestion_jobs (user_id, document_id, note_id) VALUES ($1, $2, $3)', [
    userId,
    documentId,
    noteId,
  ]);
}

/**
 * Atomically claim the next runnable job. FOR UPDATE SKIP LOCKED lets any number
 * of workers (or API replicas) poll the same table without double-processing.
 */
export async function claimNext() {
  const { rows } = await query(
    `UPDATE ingestion_jobs SET status = 'running', attempts = attempts + 1, locked_at = now()
      WHERE id = (
        SELECT id FROM ingestion_jobs
         WHERE status = 'pending' AND run_after <= now()
         ORDER BY run_after
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING id, user_id, document_id, note_id, attempts, max_attempts`,
  );
  return rows[0] ?? null;
}

export async function complete(id) {
  await query(`UPDATE ingestion_jobs SET status = 'done', locked_at = NULL, last_error = NULL WHERE id = $1`, [id]);
}

/** Retry with exponential backoff until max_attempts, then mark failed. Returns true if it will retry. */
export async function fail(job, message) {
  const willRetry = job.attempts < job.max_attempts;
  await query(
    `UPDATE ingestion_jobs
        SET status = $2, last_error = $3, locked_at = NULL,
            run_after = now() + make_interval(secs => $4::double precision)
      WHERE id = $1`,
    [job.id, willRetry ? 'pending' : 'failed', message.slice(0, 1000), 5 * 2 ** job.attempts],
  );
  return willRetry;
}

/** Jobs left 'running' by a crashed process are returned to the queue on startup. */
export async function recoverStale(minutes = 10) {
  const { rowCount } = await query(
    `UPDATE ingestion_jobs SET status = 'pending', locked_at = NULL
      WHERE status = 'running' AND locked_at < now() - make_interval(mins => $1::int)`,
    [minutes],
  );
  return rowCount;
}

/** Remove finished jobs older than a week to keep the table small. */
export async function purgeOld() {
  await query(`DELETE FROM ingestion_jobs WHERE status IN ('done', 'failed') AND updated_at < now() - interval '7 days'`);
}

import { query } from '../config/database.js';

/*
 * Every read/write is scoped by user_id in the WHERE clause. A document id that
 * belongs to someone else behaves exactly like one that doesn't exist (404),
 * so ids can't even be probed across tenants.
 */
const COLUMNS = `id, title, original_name, file_type, mime_type, size_bytes, status, error_message,
  page_count, char_count, chunk_count, processed_at, created_at, updated_at`;

export async function create(client, doc) {
  const { rows } = await client.query(
    `INSERT INTO documents (user_id, title, original_name, file_type, mime_type, size_bytes, storage_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued') RETURNING ${COLUMNS}`,
    [doc.userId, doc.title, doc.originalName, doc.fileType, doc.mimeType, doc.sizeBytes, doc.storagePath],
  );
  return rows[0];
}

export async function list(userId, { limit, offset, status, q }) {
  const params = [userId];
  const where = ['user_id = $1'];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(title ILIKE $${params.length} OR original_name ILIKE $${params.length})`);
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${COLUMNS}, count(*) OVER()::int AS total_count
       FROM documents WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows.map(({ total_count: _t, ...r }) => r), total: rows[0]?.total_count ?? 0 };
}

export async function findById(userId, id) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM documents WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ?? null;
}

export async function findStoragePath(userId, id) {
  const { rows } = await query(
    'SELECT storage_path, original_name, file_type, mime_type FROM documents WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ?? null;
}

/** Internal (worker) lookup — the job row already proves ownership. */
export async function findForProcessing(id) {
  const { rows } = await query('SELECT id, user_id, title, file_type, storage_path FROM documents WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function setStatus(client, id, status, fields = {}) {
  await client.query(
    `UPDATE documents SET status = $2, error_message = $3,
        chunk_count = COALESCE($4, chunk_count), page_count = COALESCE($5, page_count),
        char_count = COALESCE($6, char_count), file_type = COALESCE($7, file_type),
        processed_at = CASE WHEN $2 IN ('indexed', 'failed') THEN now() ELSE processed_at END
      WHERE id = $1`,
    [
      id,
      status,
      fields.errorMessage ?? null,
      fields.chunkCount ?? null,
      fields.pageCount ?? null,
      fields.charCount ?? null,
      fields.fileType ?? null,
    ],
  );
}

export async function rename(userId, id, title) {
  const { rows } = await query(`UPDATE documents SET title = $3 WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`, [
    id,
    userId,
    title,
  ]);
  return rows[0] ?? null;
}

/** Returns the storage path of the deleted row so the file can be removed. Chunks cascade. */
export async function remove(userId, id) {
  const { rows } = await query('DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING storage_path', [
    id,
    userId,
  ]);
  return rows[0] ?? null;
}

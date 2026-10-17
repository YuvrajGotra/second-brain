import { query } from '../config/database.js';

const COLUMNS = `id, title, content, tags, index_enabled, index_status, index_error, chunk_count, created_at, updated_at`;

export async function create(client, userId, { title, content, tags, indexEnabled }) {
  const { rows } = await client.query(
    `INSERT INTO notes (user_id, title, content, tags, index_enabled, index_status)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN 'queued' ELSE 'disabled' END) RETURNING ${COLUMNS}`,
    [userId, title, content, tags, indexEnabled],
  );
  return rows[0];
}

export async function list(userId, { limit, offset, q, tag }) {
  const params = [userId];
  const where = ['user_id = $1'];
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
  }
  if (tag) {
    params.push(tag);
    where.push(`$${params.length} = ANY(tags)`);
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${COLUMNS}, count(*) OVER()::int AS total_count
       FROM notes WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows.map(({ total_count: _t, ...r }) => r), total: rows[0]?.total_count ?? 0 };
}

export async function listTags(userId) {
  const { rows } = await query(
    `SELECT tag, count(*)::int AS count FROM notes, unnest(tags) AS tag
      WHERE user_id = $1 GROUP BY tag ORDER BY count DESC, tag LIMIT 100`,
    [userId],
  );
  return rows;
}

export async function findById(userId, id) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM notes WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ?? null;
}

export async function findForProcessing(id) {
  const { rows } = await query('SELECT id, user_id, title, content, tags, index_enabled FROM notes WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function update(client, userId, id, fields) {
  const { rows } = await client.query(
    `UPDATE notes SET
        title = COALESCE($3, title),
        content = COALESCE($4, content),
        tags = COALESCE($5, tags),
        index_enabled = COALESCE($6, index_enabled),
        index_status = CASE WHEN COALESCE($6, index_enabled) THEN 'queued' ELSE 'disabled' END,
        index_error = NULL
      WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    [id, userId, fields.title ?? null, fields.content ?? null, fields.tags ?? null, fields.indexEnabled ?? null],
  );
  return rows[0] ?? null;
}

export async function setIndexStatus(client, id, status, { chunkCount, error } = {}) {
  await client.query(
    `UPDATE notes SET index_status = $2, chunk_count = COALESCE($3, chunk_count), index_error = $4
      WHERE id = $1`,
    [id, status, chunkCount ?? null, error ?? null],
  );
}

export async function remove(userId, id) {
  const { rowCount } = await query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}

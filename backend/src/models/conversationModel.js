import { query } from '../config/database.js';

export async function create(userId, title = 'New conversation') {
  const { rows } = await query(
    'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at',
    [userId, title],
  );
  return rows[0];
}

export async function list(userId, { limit, offset, q }) {
  const params = [userId];
  let where = 'c.user_id = $1';
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where += ` AND c.title ILIKE $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count,
            (SELECT left(m.content, 140) FROM messages m WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            count(*) OVER()::int AS total_count
       FROM conversations c
      WHERE ${where}
      ORDER BY c.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows.map(({ total_count: _t, ...r }) => r), total: rows[0]?.total_count ?? 0 };
}

export async function findById(userId, id) {
  const { rows } = await query(
    'SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function rename(userId, id, title) {
  const { rows } = await query(
    'UPDATE conversations SET title = $3 WHERE id = $1 AND user_id = $2 RETURNING id, title, created_at, updated_at',
    [id, userId, title],
  );
  return rows[0] ?? null;
}

export async function touch(id) {
  await query('UPDATE conversations SET updated_at = now() WHERE id = $1', [id]);
}

export async function remove(userId, id) {
  const { rowCount } = await query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}

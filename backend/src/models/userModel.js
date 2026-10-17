import { query } from '../config/database.js';

const PUBLIC_COLUMNS = 'id, name, email, created_at, updated_at';

export async function findById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Includes password_hash — only for credential checks, never return it to clients. */
export async function findByEmailWithHash(email) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`, [
    email,
  ]);
  return rows[0] ?? null;
}

export async function findHashById(id) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [id]);
  return rows[0]?.password_hash ?? null;
}

export async function create({ name, email, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash],
  );
  return rows[0];
}

export async function updateName(id, name) {
  const { rows } = await query(`UPDATE users SET name = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`, [id, name]);
  return rows[0] ?? null;
}

export async function updatePasswordHash(id, passwordHash) {
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

export async function remove(id) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

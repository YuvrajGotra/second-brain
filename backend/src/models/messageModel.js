import { query } from '../config/database.js';

const COLUMNS = 'id, conversation_id, role, content, sources, metadata, created_at';

/** Caller must have verified the conversation belongs to the user. */
export async function create({ conversationId, role, content, sources = [], metadata = {} }) {
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, role, content, sources, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [conversationId, role, content, JSON.stringify(sources), JSON.stringify(metadata)],
  );
  return rows[0];
}

export async function listForConversation(conversationId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM messages WHERE conversation_id = $1 ORDER BY created_at, id`,
    [conversationId],
  );
  return rows;
}

/** Most recent N messages (oldest first) — the history used for follow-up questions. */
export async function recentHistory(conversationId, limit) {
  if (limit <= 0) return [];
  const { rows } = await query(
    `SELECT role, content FROM (
       SELECT role, content, created_at FROM messages WHERE conversation_id = $1
        ORDER BY created_at DESC LIMIT $2) recent
     ORDER BY created_at`,
    [conversationId, limit],
  );
  return rows;
}

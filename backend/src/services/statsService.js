import { query } from '../config/database.js';

/** Dashboard numbers in a single round-trip. */
export async function getDashboardStats(userId) {
  const [counts, recentDocuments, recentConversations] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*)::int FROM documents WHERE user_id = $1)                         AS documents,
         (SELECT count(*)::int FROM documents WHERE user_id = $1 AND status = 'indexed')  AS documents_indexed,
         (SELECT count(*)::int FROM documents WHERE user_id = $1 AND status IN ('queued','processing')) AS documents_processing,
         (SELECT count(*)::int FROM documents WHERE user_id = $1 AND status = 'failed')   AS documents_failed,
         (SELECT COALESCE(sum(size_bytes), 0)::bigint FROM documents WHERE user_id = $1) AS storage_bytes,
         (SELECT count(*)::int FROM notes WHERE user_id = $1)                             AS notes,
         (SELECT count(*)::int FROM document_chunks WHERE user_id = $1)                   AS chunks,
         (SELECT count(*)::int FROM conversations WHERE user_id = $1)                     AS conversations,
         (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.user_id = $1 AND m.role = 'user')                                       AS questions_asked`,
      [userId],
    ),
    query(
      `SELECT id, title, file_type, status, chunk_count, created_at FROM documents
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId],
    ),
    query(
      `SELECT id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5`,
      [userId],
    ),
  ]);

  const c = counts.rows[0];
  return {
    counts: { ...c, storage_bytes: Number(c.storage_bytes) },
    recentDocuments: recentDocuments.rows,
    recentConversations: recentConversations.rows,
  };
}

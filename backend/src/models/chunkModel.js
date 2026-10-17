import { query, toVector } from '../config/database.js';

/** Bulk insert with a single multi-row INSERT per batch (much faster than row-by-row). */
export async function insertMany(client, { userId, documentId = null, noteId = null }, chunks) {
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const values = [];
    const params = [];
    batch.forEach((c) => {
      const base = params.length;
      params.push(
        userId,
        documentId,
        noteId,
        c.chunkIndex,
        c.content,
        c.pageNumber,
        c.pageEnd,
        c.section,
        c.tokenEstimate,
        toVector(c.embedding),
      );
      values.push(`(${Array.from({ length: 10 }, (_, k) => `$${base + k + 1}`).join(', ')})`);
    });
    await client.query(
      `INSERT INTO document_chunks
         (user_id, document_id, note_id, chunk_index, content, page_number, page_end, section, token_estimate, embedding)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
}

export async function deleteForSource(client, { documentId, noteId }) {
  if (documentId) await client.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
  if (noteId) await client.query('DELETE FROM document_chunks WHERE note_id = $1', [noteId]);
}

export async function listForDocument(userId, documentId, { limit, offset }) {
  const { rows } = await query(
    `SELECT id, chunk_index, content, page_number, page_end, section, token_estimate
       FROM document_chunks WHERE user_id = $1 AND document_id = $2
      ORDER BY chunk_index LIMIT $3 OFFSET $4`,
    [userId, documentId, limit, offset],
  );
  return rows;
}

export async function findById(userId, chunkId) {
  const { rows } = await query(
    `SELECT c.id, c.chunk_index, c.content, c.page_number, c.page_end, c.section,
            c.document_id, c.note_id, COALESCE(d.title, n.title) AS source_title,
            CASE WHEN c.document_id IS NOT NULL THEN d.file_type ELSE 'note' END AS source_type
       FROM document_chunks c
       LEFT JOIN documents d ON d.id = c.document_id
       LEFT JOIN notes n ON n.id = c.note_id
      WHERE c.id = $1 AND c.user_id = $2`,
    [chunkId, userId],
  );
  return rows[0] ?? null;
}

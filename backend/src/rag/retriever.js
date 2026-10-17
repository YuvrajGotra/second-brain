import { query, toVector } from '../config/database.js';
import { env } from '../config/env.js';
import { ai } from './aiProvider.js';

const RRF_K = 60; // standard Reciprocal Rank Fusion constant
const KEYWORD_STOPWORDS = new Set(
  'a an and are as at be but by can do does for from how i if in into is it of on or so that the this to was what when where which who why with you your about explain tell me'.split(
    ' ',
  ),
);

/**
 * Build an OR-style tsquery ("jwt | refresh | token") from free text. Natural
 * questions rarely contain every term of a passage, so AND semantics
 * (websearch_to_tsquery) would miss most relevant chunks. Tokens are reduced to
 * [a-z0-9] so the string can never contain tsquery operators.
 */
export function buildKeywordQuery(text) {
  const terms = [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !KEYWORD_STOPWORDS.has(t)))];
  return terms.length ? terms.slice(0, 24).join(' | ') : null;
}

function sourceFilterSql(filters, params) {
  const clauses = [];
  if (filters.sourceType === 'documents') clauses.push('document_id IS NOT NULL');
  if (filters.sourceType === 'notes') clauses.push('note_id IS NOT NULL');
  if (filters.documentIds?.length) {
    params.push(filters.documentIds);
    clauses.push(`document_id = ANY($${params.length}::uuid[])`);
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

/**
 * Hybrid retrieval: semantic (pgvector cosine) + lexical (PostgreSQL full-text)
 * results fused with Reciprocal Rank Fusion, scoped to ONE user.
 *
 *   score(chunk) = 1/(k + rank_vector) + 1/(k + rank_keyword)
 *
 * RRF needs no score normalisation between the two very different scales and
 * rewards chunks that both retrievers agree on.
 *
 * @param {object} opts
 * @param {string} opts.userId      authenticated user — every branch filters on it
 * @param {string} opts.text        query text (used for keyword search)
 * @param {number[]} [opts.embedding] query vector (computed if omitted)
 * @param {number} [opts.limit]     candidates to return
 * @param {'hybrid'|'semantic'|'keyword'} [opts.mode]
 */
export async function hybridSearch({ userId, text, embedding, limit = env.RAG_CANDIDATES, mode = 'hybrid', filters = {} }) {
  const useVector = mode !== 'keyword';
  const keywordQuery = mode !== 'semantic' ? buildKeywordQuery(text) : null;
  if (!useVector && !keywordQuery) return [];

  const queryVector = useVector ? (embedding ?? (await ai.embedQuery(text))) : null;

  const params = [userId, limit];
  const filterSql = sourceFilterSql(filters, params);
  const ctes = [];
  let v = null; // placeholder of the query vector, reused in the final SELECT

  if (useVector) {
    params.push(toVector(queryVector));
    v = `$${params.length}::vector`;
    ctes.push(`vector_hits AS (
      SELECT id, similarity, row_number() OVER (ORDER BY distance) AS rank FROM (
        SELECT id, embedding <=> ${v} AS distance, 1 - (embedding <=> ${v}) AS similarity
          FROM document_chunks
         WHERE user_id = $1${filterSql}
         ORDER BY embedding <=> ${v}
         LIMIT $2) nn)`);
  } else {
    ctes.push(`vector_hits AS (SELECT NULL::uuid AS id, NULL::float8 AS similarity, NULL::bigint AS rank WHERE false)`);
  }

  if (keywordQuery) {
    params.push(keywordQuery);
    const q = `to_tsquery('english', $${params.length})`;
    ctes.push(`keyword_hits AS (
      SELECT id, keyword_score, row_number() OVER (ORDER BY keyword_score DESC) AS rank FROM (
        SELECT id, ts_rank_cd(content_tsv, ${q}, 32) AS keyword_score
          FROM document_chunks
         WHERE user_id = $1${filterSql} AND content_tsv @@ ${q}
         ORDER BY keyword_score DESC
         LIMIT $2) kw)`);
  } else {
    ctes.push(`keyword_hits AS (SELECT NULL::uuid AS id, NULL::float4 AS keyword_score, NULL::bigint AS rank WHERE false)`);
  }

  const sql = `
    WITH ${ctes.join(',\n')},
    fused AS (
      SELECT COALESCE(v.id, k.id) AS id,
             COALESCE(1.0 / (${RRF_K} + v.rank), 0) + COALESCE(1.0 / (${RRF_K} + k.rank), 0) AS rrf_score,
             v.similarity, k.keyword_score, v.rank AS vector_rank, k.rank AS keyword_rank
        FROM vector_hits v FULL OUTER JOIN keyword_hits k ON v.id = k.id
    )
    SELECT f.id AS chunk_id, f.rrf_score, f.similarity, f.keyword_score, f.vector_rank, f.keyword_rank,
           c.content, c.page_number, c.page_end, c.section, c.chunk_index, c.document_id, c.note_id,
           COALESCE(d.title, n.title) AS source_title,
           CASE WHEN c.document_id IS NOT NULL THEN d.file_type ELSE 'note' END AS file_type,
           ${v ? `1 - (c.embedding <=> ${v})` : 'NULL::float8'} AS cosine_similarity
      FROM fused f
      JOIN document_chunks c ON c.id = f.id AND c.user_id = $1
      LEFT JOIN documents d ON d.id = c.document_id
      LEFT JOIN notes n ON n.id = c.note_id
     ORDER BY f.rrf_score DESC
     LIMIT $2`;

  const { rows } = await query(sql, params);

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    noteId: r.note_id,
    sourceType: r.document_id ? 'document' : 'note',
    sourceTitle: r.source_title,
    fileType: r.file_type,
    content: r.content,
    pageNumber: r.page_number,
    pageEnd: r.page_end,
    section: r.section,
    chunkIndex: r.chunk_index,
    similarity: r.cosine_similarity == null ? null : Number(r.cosine_similarity),
    keywordScore: r.keyword_score == null ? null : Number(r.keyword_score),
    vectorRank: r.vector_rank == null ? null : Number(r.vector_rank),
    keywordRank: r.keyword_rank == null ? null : Number(r.keyword_rank),
    rrfScore: Number(r.rrf_score),
  }));
}

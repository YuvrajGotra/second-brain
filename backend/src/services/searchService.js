import { hybridSearch } from '../rag/retriever.js';
import { describeLocation } from '../rag/contextBuilder.js';
import { env } from '../config/env.js';

/** Return a ~320 char window around the first query term so results show *why* they matched. */
function snippet(content, queryText, size = 320) {
  if (content.length <= size) return content;
  const terms = (queryText.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).sort((a, b) => b.length - a.length);
  const lower = content.toLowerCase();
  const hit = terms.map((t) => lower.indexOf(t)).find((i) => i >= 0) ?? 0;
  let start = Math.max(0, Math.min(hit - Math.floor(size / 3), content.length - size));
  // Prefer starting at a sentence boundary just before the match.
  const boundary = content.lastIndexOf('. ', hit);
  if (boundary >= 0 && hit - boundary < size * 0.6) start = Math.min(boundary + 2, start + size);
  if (boundary < 0 && hit < size * 0.6) start = 0;
  const prefix = start > 0 ? '…' : '';
  const suffix = start + size < content.length ? '…' : '';
  return `${prefix}${content.slice(start, start + size).trim()}${suffix}`;
}

/** Semantic / keyword / hybrid search over the user's chunks (no LLM involved — fast). */
export async function search(userId, { query, limit, mode, sourceType }) {
  const results = await hybridSearch({ userId, text: query, limit, mode, filters: { sourceType } });
  return results
    .filter((r) => mode === 'keyword' || r.keywordRank != null || (r.similarity ?? 0) >= env.RAG_MIN_SIMILARITY * 0.8)
    .map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      noteId: r.noteId,
      sourceType: r.sourceType,
      title: r.sourceTitle,
      fileType: r.fileType,
      pageNumber: r.pageNumber,
      section: r.section,
      location: describeLocation(r),
      snippet: snippet(r.content, query),
      content: r.content,
      similarity: r.similarity,
      matchedKeywords: r.keywordRank != null,
      score: r.rrfScore,
    }));
}

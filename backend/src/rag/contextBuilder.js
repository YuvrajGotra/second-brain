import { estimateTokens } from './textUtils.js';

const MAX_CONTEXT_TOKENS = 6000;

/** Human-readable location used in prompts and citations: "page 4", "pages 4–5", "00:12:30", "Auth > JWT". */
export function describeLocation(chunk) {
  const parts = [];
  if (chunk.pageNumber) {
    parts.push(chunk.pageEnd && chunk.pageEnd !== chunk.pageNumber ? `pages ${chunk.pageNumber}–${chunk.pageEnd}` : `page ${chunk.pageNumber}`);
  }
  if (chunk.section) parts.push(chunk.fileType === 'transcript' ? `at ${chunk.section}` : `section "${chunk.section}"`);
  return parts.join(', ');
}

/**
 * Numbers the selected chunks [1..n] and formats them for the prompt, staying
 * within a token budget. Returns the prompt text plus the citation list whose
 * indices match the numbers the model will cite.
 */
export function buildContext(chunks) {
  const used = [];
  let tokens = 0;
  for (const chunk of chunks) {
    const cost = estimateTokens(chunk.content) + 30;
    if (used.length && tokens + cost > MAX_CONTEXT_TOKENS) break;
    used.push(chunk);
    tokens += cost;
  }

  const text = used
    .map((c, i) => {
      const location = describeLocation(c);
      return `[${i + 1}] Source: ${c.sourceTitle}${location ? ` (${location})` : ''}\n${c.content}`;
    })
    .join('\n\n');

  const sources = used.map((c, i) => ({
    index: i + 1,
    chunkId: c.chunkId,
    documentId: c.documentId,
    noteId: c.noteId,
    sourceType: c.sourceType,
    title: c.sourceTitle,
    fileType: c.fileType,
    pageNumber: c.pageNumber,
    pageEnd: c.pageEnd,
    section: c.section,
    location: describeLocation(c),
    excerpt: c.content,
    similarity: c.similarity == null ? null : Number(c.similarity.toFixed(4)),
    rerankScore: c.rerankScore ?? null,
  }));

  return { text, sources };
}

/** Which [n] markers did the answer actually use? */
export function extractCitedIndices(answer, maxIndex) {
  const cited = new Set();
  for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of match[1].split(',').map((x) => Number(x.trim()))) {
      if (n >= 1 && n <= maxIndex) cited.add(n);
    }
  }
  return cited;
}

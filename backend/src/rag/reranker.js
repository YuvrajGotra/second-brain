import { env } from '../config/env.js';
import { ai } from './aiProvider.js';
import { RERANK_SYSTEM_PROMPT, buildRerankPrompt } from './prompts.js';
import { truncate } from './textUtils.js';
import { logger } from '../utils/logger.js';

const MIN_RELEVANCE = 3; // on the 0–10 scale; below this a passage is considered noise

/**
 * Second-stage reranking: the hybrid retriever casts a wide net (RAG_CANDIDATES),
 * then an LLM judges every candidate against the query in a single batched call
 * (a "listwise" LLM reranker). This is much more precise than embedding
 * similarity alone, and lets us drop irrelevant chunks entirely so the model
 * can honestly say "not found".
 *
 * Returns candidates sorted by relevance with `rerankScore` attached. On any
 * failure it falls back to the retriever's RRF order.
 */
export async function rerank(queryText, candidates, topK) {
  if (!candidates.length) return [];
  if (!env.RAG_RERANK || candidates.length <= 1) return candidates.slice(0, topK);

  try {
    const raw = await ai.generate({
      task: 'rerank',
      system: RERANK_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildRerankPrompt(
            queryText,
            candidates.map((c) => truncate(`${c.sourceTitle}${c.section ? ` — ${c.section}` : ''}: ${c.content}`, 900)),
          ),
        },
      ],
      json: true,
      temperature: 0,
      maxOutputTokens: 400,
      fast: true,
      meta: { query: queryText, passages: candidates.map((c) => c.content) },
    });

    const scores = JSON.parse(raw)?.scores;
    if (!Array.isArray(scores) || scores.length !== candidates.length) throw new Error('Malformed rerank response');

    return candidates
      .map((c, i) => ({ ...c, rerankScore: Math.max(0, Math.min(10, Number(scores[i]) || 0)) }))
      .filter((c) => c.rerankScore >= MIN_RELEVANCE)
      .sort((a, b) => b.rerankScore - a.rerankScore || b.rrfScore - a.rrfScore)
      .slice(0, topK);
  } catch (err) {
    logger.warn(`Rerank failed, falling back to fusion order: ${err.message}`);
    return candidates.slice(0, topK);
  }
}

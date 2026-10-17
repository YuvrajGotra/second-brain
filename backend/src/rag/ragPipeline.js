import { env } from '../config/env.js';
import { ai } from './aiProvider.js';
import { hybridSearch } from './retriever.js';
import { rerank } from './reranker.js';
import { rewriteQuery } from './queryRewriter.js';
import { buildContext, extractCitedIndices } from './contextBuilder.js';
import { ANSWER_SYSTEM_PROMPT, buildAnswerUserPrompt } from './prompts.js';
import { truncate } from './textUtils.js';

export const NOT_FOUND_ANSWER =
  "I couldn't find anything about this in your knowledge base. Try rephrasing the question, or upload a document or write a note that covers it.";

/**
 * Stage 1 — retrieval. Everything needed before the LLM writes an answer:
 *
 *   question ─► (conversation-aware rewrite) ─► embed ─► hybrid search (top N, this user only)
 *            ─► LLM rerank ─► top K ─► numbered context + citation list
 */
export async function retrieve({ userId, question, history = [], filters = {} }) {
  const timings = {};
  let t = Date.now();

  const standaloneQuery = await rewriteQuery(question, history);
  timings.rewriteMs = Date.now() - t;

  t = Date.now();
  const embedding = await ai.embedQuery(standaloneQuery);
  timings.embedMs = Date.now() - t;

  t = Date.now();
  const candidates = (
    await hybridSearch({ userId, text: standaloneQuery, embedding, limit: env.RAG_CANDIDATES, filters })
  ).filter(
    // Keep a candidate if it is semantically close OR matched keywords strongly.
    (c) => (c.similarity ?? 0) >= env.RAG_MIN_SIMILARITY || c.keywordRank != null,
  );
  timings.searchMs = Date.now() - t;

  t = Date.now();
  const top = await rerank(standaloneQuery, candidates, env.RAG_TOP_K);
  timings.rerankMs = Date.now() - t;

  const context = buildContext(top);
  return {
    standaloneQuery,
    context,
    stats: { candidates: candidates.length, selected: context.sources.length, timings },
  };
}

/** Stage 2 — generation. Builds the grounded prompt (with short chat history) for the LLM. */
export function buildGenerationRequest({ question, history, context }) {
  const recent = history.slice(-env.RAG_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: truncate(m.content, 1500),
  }));
  return {
    task: 'answer',
    system: ANSWER_SYSTEM_PROMPT,
    messages: [...recent, { role: 'user', content: buildAnswerUserPrompt(question, context.text) }],
    temperature: 0.2,
    maxOutputTokens: 2048,
    meta: { question, chunks: context.sources.map((s) => ({ content: s.excerpt })) },
  };
}

/** Marks which retrieved sources the answer actually cited (cited ones first). */
export function finalizeSources(answer, sources) {
  const cited = extractCitedIndices(answer, sources.length);
  return sources
    .map((s) => ({ ...s, cited: cited.has(s.index) }))
    .sort((a, b) => Number(b.cited) - Number(a.cited) || a.index - b.index);
}

/** Non-streaming convenience wrapper: question in, { answer, sources } out. */
export async function answerQuestion({ userId, question, history = [], filters = {} }) {
  const retrieval = await retrieve({ userId, question, history, filters });
  if (!retrieval.context.sources.length) {
    return { answer: NOT_FOUND_ANSWER, sources: [], ...retrieval };
  }
  const answer = await ai.generate(buildGenerationRequest({ question, history, context: retrieval.context }));
  return { answer, sources: finalizeSources(answer, retrieval.context.sources), ...retrieval };
}

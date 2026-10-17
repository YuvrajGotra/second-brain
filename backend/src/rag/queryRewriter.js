import { env } from '../config/env.js';
import { ai } from './aiProvider.js';
import { REWRITE_SYSTEM_PROMPT, buildRewritePrompt } from './prompts.js';
import { truncate } from './textUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Conversation-aware retrieval: "Why is it secure?" after a question about JWT
 * is rewritten to "Why is JWT authentication secure?" before embedding, so the
 * vector search looks for the right thing. Falls back to the raw question on error.
 */
export async function rewriteQuery(question, history) {
  if (!env.RAG_QUERY_REWRITE || !history.length) return question;
  const recent = history.slice(-env.RAG_HISTORY_MESSAGES).map((m) => ({ ...m, content: truncate(m.content, 600) }));
  try {
    const rewritten = await ai.generate({
      task: 'rewrite',
      system: REWRITE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildRewritePrompt(recent, question) }],
      temperature: 0,
      maxOutputTokens: 120,
      fast: true,
      meta: { question, history: recent },
    });
    const cleaned = rewritten.trim().replace(/^["']|["']$/g, '');
    return cleaned && cleaned.length <= 400 ? cleaned : question;
  } catch (err) {
    logger.warn(`Query rewrite failed, using original question: ${err.message}`);
    return question;
  }
}

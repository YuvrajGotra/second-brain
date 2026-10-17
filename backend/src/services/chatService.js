import { env } from '../config/env.js';
import { ai } from '../rag/aiProvider.js';
import { retrieve, buildGenerationRequest, finalizeSources, NOT_FOUND_ANSWER } from '../rag/ragPipeline.js';
import { TITLE_SYSTEM_PROMPT } from '../rag/prompts.js';
import * as conversationModel from '../models/conversationModel.js';
import * as messageModel from '../models/messageModel.js';
import { requireConversation } from './conversationService.js';
import { truncate } from '../rag/textUtils.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TITLE = 'New conversation';

/** Generate a short title from the first question without blocking the response. */
async function autoTitle(userId, conversationId, question) {
  let title = truncate(question.replace(/\s+/g, ' '), 60);
  try {
    const generated = await ai.generate({
      task: 'title',
      system: TITLE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }],
      temperature: 0.3,
      maxOutputTokens: 30,
      fast: true,
      meta: { question },
    });
    const cleaned = generated.trim().replace(/^["'#\s]+|["'.\s]+$/g, '');
    if (cleaned && cleaned.length <= 80) title = cleaned;
  } catch (err) {
    logger.warn(`Title generation failed: ${err.message}`);
  }
  return conversationModel.rename(userId, conversationId, title);
}

/**
 * Handles one chat turn end-to-end. `emit(event, data)` receives progress so the
 * controller can stream it over SSE (or ignore it for a plain JSON response).
 *
 *  1. resolve / create the conversation (ownership enforced)
 *  2. load recent history, persist the user message
 *  3. retrieve → rerank → build context        (emit "sources")
 *  4. stream the grounded answer from the LLM  (emit "token" per delta)
 *  5. persist the assistant message with citations + retrieval metadata
 */
export async function handleChatTurn({ userId, conversationId, message, filters, signal, emit = () => {} }) {
  const started = Date.now();
  const conversation = conversationId
    ? await requireConversation(userId, conversationId)
    : await conversationModel.create(userId);

  const history = await messageModel.recentHistory(conversation.id, env.RAG_HISTORY_MESSAGES);
  const userMessage = await messageModel.create({ conversationId: conversation.id, role: 'user', content: message });
  emit('meta', { conversation, userMessage });

  const titlePromise =
    conversation.title === DEFAULT_TITLE && history.length === 0
      ? autoTitle(userId, conversation.id, message).catch(() => null)
      : Promise.resolve(null);

  const retrieval = await retrieve({ userId, question: message, history, filters });
  emit('sources', { sources: retrieval.context.sources, standaloneQuery: retrieval.standaloneQuery });

  let answer = '';
  let aborted = false;
  const genStart = Date.now();
  if (!retrieval.context.sources.length) {
    answer = NOT_FOUND_ANSWER;
    emit('token', { text: answer });
  } else {
    const request = { ...buildGenerationRequest({ question: message, history, context: retrieval.context }), signal };
    try {
      for await (const delta of ai.stream(request)) {
        answer += delta;
        emit('token', { text: delta });
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
      aborted = true;
    }
  }

  const sources = finalizeSources(answer, retrieval.context.sources);
  const assistantMessage = await messageModel.create({
    conversationId: conversation.id,
    role: 'assistant',
    content: answer || '_(No response — the request was cancelled.)_',
    sources,
    metadata: {
      model: ai.chatModel,
      provider: ai.name,
      standaloneQuery: retrieval.standaloneQuery,
      retrieval: retrieval.stats,
      generationMs: Date.now() - genStart,
      totalMs: Date.now() - started,
      aborted,
    },
  });
  await conversationModel.touch(conversation.id);
  const renamed = await titlePromise;

  return { conversation: renamed ?? conversation, userMessage, assistantMessage };
}

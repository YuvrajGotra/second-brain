import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { sleep } from '../../utils/asyncPool.js';
import { logger } from '../../utils/logger.js';
import { l2Normalize } from '../vectorMath.js';

/**
 * Google Gemini adapter using the public REST API (no SDK, so every request is
 * visible and easy to reason about). Implements the provider interface:
 *   embedDocuments(texts) / embedQuery(text) / generate(opts) / stream(opts)
 */
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_BATCH_SIZE = 100; // API maximum per batchEmbedContents call
const MAX_RETRIES = 4;

async function callGemini(pathAndQuery, body, { stream = false, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE_URL}/${pathAndQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw Object.assign(AppError.upstream(), { cause: err });
    }

    if (res.ok) return stream ? res : res.json();

    // Retry rate limits and transient server errors with exponential backoff.
    const retryable = res.status === 429 || res.status >= 500;
    const detail = await res.text().catch(() => '');
    if (retryable && attempt < MAX_RETRIES) {
      const delay = 1000 * 2 ** attempt + Math.random() * 250;
      logger.warn(`Gemini ${res.status}, retrying in ${Math.round(delay)}ms`);
      await sleep(delay);
      continue;
    }
    logger.error(`Gemini API error ${res.status}: ${detail.slice(0, 500)}`);
    if (res.status === 400 && /API key/i.test(detail)) {
      throw AppError.upstream('The AI service rejected the API key. Check GEMINI_API_KEY in backend/.env.');
    }
    if (res.status === 429) throw AppError.upstream('AI rate limit reached. Please wait a moment and try again.');
    throw AppError.upstream();
  }
}

// gemini-embedding-001 takes a taskType field; gemini-embedding-2+ expects the
// task to be expressed as a text prefix instead.
const usesTaskType = () => /embedding-001|text-embedding/.test(env.GEMINI_EMBEDDING_MODEL);

/** @param {{text:string,title?:string}[]} items @param {'document'|'query'} kind */
async function embed(items, kind) {
  const model = `models/${env.GEMINI_EMBEDDING_MODEL}`;
  const legacy = usesTaskType();
  const vectors = [];
  for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBED_BATCH_SIZE);
    const data = await callGemini(`${model}:batchEmbedContents`, {
      requests: batch.map(({ text, title }) => {
        const request = { model, outputDimensionality: env.EMBEDDING_DIMENSIONS };
        if (legacy) {
          request.content = { parts: [{ text: title ? `${title}\n${text}` : text }] };
          request.taskType = kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
        } else {
          const prefixed =
            kind === 'query' ? `task: search result | query: ${text}` : `title: ${title || 'none'} | text: ${text}`;
          request.content = { parts: [{ text: prefixed }] };
        }
        return request;
      }),
    });
    for (const e of data.embeddings) vectors.push(l2Normalize(e.values));
  }
  if (vectors[0]?.length !== env.EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding dimension ${vectors[0]?.length} does not match EMBEDDING_DIMENSIONS`);
  }
  return vectors;
}

/** Gemini 3.x uses thinkingLevel; 2.5 uses thinkingBudget. Utility calls think as little as possible. */
function thinkingConfig(model, fast) {
  if (!fast) return undefined;
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-3/.test(model)) return { thinkingLevel: 'low' };
  return undefined;
}

function buildRequest({ system, messages, json = false, temperature = 0.2, maxOutputTokens = 2048, fast = false }, model) {
  const generationConfig = { temperature, maxOutputTokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  const thinking = thinkingConfig(model, fast);
  if (thinking) generationConfig.thinkingConfig = thinking;

  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig,
  };
}

/** Quick utility calls (rewrite, rerank, titles) go to the cheaper "fast" model. */
const modelFor = (opts) => (opts.fast ? env.GEMINI_FAST_MODEL : env.GEMINI_CHAT_MODEL);

function extractText(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    if (data?.promptFeedback?.blockReason) {
      throw AppError.unprocessable('The AI service declined to answer this request.');
    }
    return '';
  }
  return (candidate.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

export const geminiProvider = {
  name: 'gemini',
  get chatModel() {
    return env.GEMINI_CHAT_MODEL;
  },

  embedDocuments: (items) => embed(items, 'document'),
  embedQuery: async (text) => (await embed([{ text }], 'query'))[0],

  async generate(opts) {
    const model = modelFor(opts);
    const data = await callGemini(`models/${model}:generateContent`, buildRequest(opts, model), {
      signal: opts.signal,
    });
    return extractText(data);
  },

  /** Async generator yielding text deltas from the SSE stream. */
  async *stream(opts) {
    const model = modelFor(opts);
    const res = await callGemini(`models/${model}:streamGenerateContent?alt=sse`, buildRequest(opts, model), {
      stream: true,
      signal: opts.signal,
    });
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const bytes of res.body) {
      buffer += decoder.decode(bytes, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        const text = extractText(JSON.parse(payload));
        if (text) yield text;
      }
    }
  },
};

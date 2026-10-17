import { handleChatTurn } from '../services/chatService.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/chat
 * - `Accept: text/event-stream` → Server-Sent Events: meta → sources → token* → done (or error)
 * - otherwise → a single JSON response once the answer is complete
 */
export async function chat(req, res) {
  const { conversationId, message, filters } = req.validated.body;
  const wantsStream = (req.get('accept') || '').includes('text/event-stream');

  if (!wantsStream) {
    const result = await handleChatTurn({ userId: req.user.id, conversationId, message, filters });
    return ok(res, result);
  }

  // Abort the upstream LLM call if the browser disconnects (user pressed Stop / closed tab).
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await handleChatTurn({
      userId: req.user.id,
      conversationId,
      message,
      filters,
      signal: controller.signal,
      emit: send,
    });
    send('done', result);
  } catch (err) {
    const safe = err instanceof AppError;
    if (!safe) logger.error('Chat stream failed:', err);
    send('error', {
      code: safe ? err.code : 'INTERNAL_ERROR',
      message: safe ? err.message : 'Something went wrong while generating the answer. Please try again.',
    });
  } finally {
    res.end();
  }
}

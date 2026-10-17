import { api, unwrap, unwrapList } from './api';

export const conversationService = {
  list: (params) => api.get('/conversations', { params }).then(unwrapList),
  get: (id) => api.get(`/conversations/${id}`).then(unwrap),
  rename: (id, title) => api.patch(`/conversations/${id}`, { title }).then(unwrap),
  remove: (id) => api.delete(`/conversations/${id}`).then(unwrap),
};

/**
 * Streams a chat turn over Server-Sent Events.
 * axios can't consume a streaming body in the browser, so this uses fetch +
 * ReadableStream and parses the `event:` / `data:` frames manually.
 *
 * handlers: { onMeta, onSources, onToken, onDone, onError }
 */
export async function streamChat({ conversationId, message, filters, signal }, handlers) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ conversationId, message, filters }),
    signal,
  });

  // Validation / auth / rate-limit errors arrive as normal JSON before streaming starts.
  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error?.message || 'Request failed');
    err.status = res.status;
    err.serverMessage = body?.error?.message;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = (frame) => {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    const payload = JSON.parse(data);
    const handler = { meta: 'onMeta', sources: 'onSources', token: 'onToken', done: 'onDone', error: 'onError' }[event];
    handlers[handler]?.(payload);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      dispatch(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}

export const chatOnce = (body) => api.post('/chat', body).then(unwrap);

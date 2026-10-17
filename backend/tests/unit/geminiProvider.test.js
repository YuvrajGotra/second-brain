import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { geminiProvider } from '../../src/rag/providers/geminiProvider.js';

// The adapter is exercised against a stubbed fetch so the request format and
// SSE parsing are verified without network access or an API key.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const jsonResponse = (body) => new Response(JSON.stringify(body), { status: 200 });

test('embedDocuments sends title/text prefixed batch requests and normalises vectors', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return jsonResponse({ embeddings: captured.body.requests.map(() => ({ values: new Array(768).fill(2) })) });
  };
  const vectors = await geminiProvider.embedDocuments([{ title: 'Notes', text: 'JWT has three parts' }]);
  assert.match(captured.url, /models\/gemini-embedding-2:batchEmbedContents$/);
  assert.equal(captured.body.requests[0].content.parts[0].text, 'title: Notes | text: JWT has three parts');
  assert.equal(captured.body.requests[0].outputDimensionality, 768);
  assert.ok('x-goog-api-key' in captured.headers);
  const norm = Math.sqrt(vectors[0].reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
});

test('embedQuery uses the search-query task prefix', async () => {
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse({ embeddings: [{ values: new Array(768).fill(1) }] });
  };
  await geminiProvider.embedQuery('what is jwt');
  assert.equal(body.requests[0].content.parts[0].text, 'task: search result | query: what is jwt');
});

test('generate maps roles, system prompt and JSON mode', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"scores":[1]}' }] } }] });
  };
  const out = await geminiProvider.generate({
    system: 'sys',
    messages: [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ],
    json: true,
    fast: true,
  });
  assert.equal(out, '{"scores":[1]}');
  assert.match(captured.url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.deepEqual(
    captured.body.contents.map((c) => c.role),
    ['user', 'model'],
  );
  assert.equal(captured.body.systemInstruction.parts[0].text, 'sys');
  assert.equal(captured.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(captured.body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
});

test('stream parses SSE chunks into text deltas', async () => {
  const events = ['Hello', ' world'].map(
    (t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\r\n\r\n`,
  );
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          // split mid-event to exercise buffering
          const all = events.join('');
          controller.enqueue(new TextEncoder().encode(all.slice(0, 30)));
          controller.enqueue(new TextEncoder().encode(all.slice(30)));
          controller.close();
        },
      }),
      { status: 200 },
    );
  let text = '';
  for await (const delta of geminiProvider.stream({ messages: [{ role: 'user', content: 'hi' }] })) text += delta;
  assert.equal(text, 'Hello world');
});

test('non-retryable API errors become safe 502s', async () => {
  globalThis.fetch = async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 });
  await assert.rejects(geminiProvider.generate({ messages: [{ role: 'user', content: 'x' }] }), (err) => {
    assert.equal(err.status, 502);
    assert.match(err.message, /API key/);
    return true;
  });
});

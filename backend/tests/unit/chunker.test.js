import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSegments } from '../../src/rag/chunker.js';

const sentence = (i) => `Sentence number ${i} talks about topic ${i % 5} in some detail.`;
const paragraph = (from, n) => Array.from({ length: n }, (_, k) => sentence(from + k)).join(' ');

test('respects chunkSize and keeps sentences intact', () => {
  const text = [paragraph(0, 20), paragraph(20, 20), paragraph(40, 20)].join('\n\n');
  const chunks = chunkSegments([{ text }], { chunkSize: 400, chunkOverlap: 80 });
  assert.ok(chunks.length > 3);
  for (const c of chunks) {
    assert.ok(c.content.length <= 400, `chunk too long: ${c.content.length}`);
    assert.match(c.content, /\.$/, 'chunk should end at a sentence boundary');
    assert.match(c.content, /^Sentence number \d+/, 'chunk should start at a sentence boundary');
  }
  chunks.forEach((c, i) => assert.equal(c.chunkIndex, i));
});

test('consecutive chunks overlap by whole sentences', () => {
  const chunks = chunkSegments([{ text: paragraph(0, 40) }], { chunkSize: 400, chunkOverlap: 120 });
  for (let i = 1; i < chunks.length; i++) {
    const firstSentence = chunks[i].content.split('. ')[0];
    assert.ok(chunks[i - 1].content.includes(firstSentence), `chunk ${i} should start with overlap from ${i - 1}`);
  }
});

test('does not merge across sections and keeps section metadata', () => {
  const chunks = chunkSegments(
    [
      { text: 'Intro text about JWT.', section: 'Auth > JWT' },
      { text: 'Refresh tokens rotate.', section: 'Auth > Refresh' },
    ],
    { chunkSize: 1000, chunkOverlap: 100 },
  );
  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.map((c) => c.section),
    ['Auth > JWT', 'Auth > Refresh'],
  );
});

test('tracks page ranges when a chunk spans pages', () => {
  const chunks = chunkSegments(
    [
      { text: 'Short page one text.', pageNumber: 1 },
      { text: 'Short page two text.', pageNumber: 2 },
    ],
    { chunkSize: 1000, chunkOverlap: 100 },
  );
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].pageNumber, 1);
  assert.equal(chunks[0].pageEnd, 2);
});

test('hard-splits text with no sentence boundaries', () => {
  const blob = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' ');
  const chunks = chunkSegments([{ text: blob }], { chunkSize: 300, chunkOverlap: 0 });
  assert.ok(chunks.every((c) => c.content.length <= 300));
  assert.equal(chunks.map((c) => c.content).join(' ').split(' ').length, 1000);
});

test('rejects overlap >= half the chunk size', () => {
  assert.throws(() => chunkSegments([{ text: 'x' }], { chunkSize: 200, chunkOverlap: 100 }));
});

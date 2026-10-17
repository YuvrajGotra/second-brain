import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKeywordQuery } from '../../src/rag/retriever.js';
import { buildContext, extractCitedIndices, describeLocation } from '../../src/rag/contextBuilder.js';
import { finalizeSources } from '../../src/rag/ragPipeline.js';

test('keyword query is OR-joined, stopword-free and operator-safe', () => {
  assert.equal(buildKeywordQuery('How does JWT authentication work?'), 'jwt | authentication | work');
  assert.equal(buildKeywordQuery("'; DROP TABLE users; -- & | !"), 'drop | table | users');
  assert.equal(buildKeywordQuery('the and of'), null);
});

test('citation indices are parsed, bounded and deduplicated', () => {
  const cited = extractCitedIndices('A [1]. B [2][1]. C [3, 4]. Bad [9].', 4);
  assert.deepEqual([...cited].sort(), [1, 2, 3, 4]);
});

test('context numbering matches citation metadata', () => {
  const chunk = (id, extra = {}) => ({
    chunkId: id,
    documentId: 'd',
    sourceType: 'document',
    sourceTitle: 'Notes',
    fileType: 'pdf',
    content: `content ${id}`,
    similarity: 0.8,
    ...extra,
  });
  const { text, sources } = buildContext([chunk('a', { pageNumber: 4 }), chunk('b', { pageNumber: 4, pageEnd: 5 })]);
  assert.match(text, /\[1\] Source: Notes \(page 4\)\ncontent a/);
  assert.match(text, /\[2\] Source: Notes \(pages 4–5\)/);
  assert.deepEqual(
    sources.map((s) => s.index),
    [1, 2],
  );

  const final = finalizeSources('Only the second [2].', sources);
  assert.equal(final[0].index, 2);
  assert.equal(final[0].cited, true);
  assert.equal(final[1].cited, false);
});

test('transcript locations read as timestamps', () => {
  assert.equal(describeLocation({ fileType: 'transcript', section: '00:12:30' }), 'at 00:12:30');
  assert.equal(describeLocation({ fileType: 'markdown', section: 'Auth > JWT' }), 'section "Auth > JWT"');
});

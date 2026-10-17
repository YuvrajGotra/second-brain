import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractDocument, detectFileType } from '../../src/rag/extractors/index.js';
import { looksLikeTranscript } from '../../src/rag/extractors/transcriptExtractor.js';
import { reflowPdfText } from '../../src/rag/textCleaner.js';

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

test('detects file types by extension', () => {
  assert.equal(detectFileType('Notes.PDF'), 'pdf');
  assert.equal(detectFileType('a.markdown'), 'markdown');
  assert.equal(detectFileType('talk.srt'), 'transcript');
  assert.equal(detectFileType('evil.exe'), null);
  assert.equal(detectFileType('noext'), null);
});

test('extracts PDF text per page', async () => {
  const result = await extractDocument(fixture('backend-notes.pdf'), 'pdf');
  assert.equal(result.pageCount, 3);
  assert.deepEqual(
    result.segments.map((s) => s.pageNumber),
    [1, 2, 3],
  );
  assert.match(result.segments[1].text, /JSON Web Token/);
});

test('rejects a fake PDF', async () => {
  await assert.rejects(extractDocument(Buffer.from('hello'), 'pdf'), { status: 422 });
});

test('markdown is split by heading path and syntax is stripped', async () => {
  const md = '# Auth\nUse **bold** and [links](http://x.y).\n\n## JWT\nThree parts.\n\n```js\nconst a = 1;\n```';
  const { segments } = await extractDocument(Buffer.from(md), 'markdown');
  assert.deepEqual(
    segments.map((s) => s.section),
    ['Auth', 'Auth > JWT'],
  );
  assert.equal(segments[0].text, 'Use bold and links.');
  assert.match(segments[1].text, /```js\nconst a = 1;\n```/);
});

test('WebVTT transcripts keep speakers and timestamps', async () => {
  const { segments, fileType } = await extractDocument(fixture('lecture-12.vtt'), 'transcript');
  assert.equal(fileType, 'transcript');
  assert.equal(segments[0].section, '00:00:05');
  assert.match(segments[0].text, /^Professor: Welcome back/);
  assert.equal(segments[1].section, '00:02:10');
});

test('timestamped .txt files are promoted to transcripts', async () => {
  const txt = '[00:00:01] Alice: hi\n[00:00:05] Bob: hello\n[00:00:09] Alice: JWT time\n[00:00:15] Bob: ok';
  assert.equal(looksLikeTranscript(txt), true);
  const result = await extractDocument(Buffer.from(txt), 'text');
  assert.equal(result.fileType, 'transcript');
});

test('binary content is rejected for text files', async () => {
  await assert.rejects(extractDocument(Buffer.from([0x48, 0x00, 0x49]), 'text'), { status: 422 });
});

test('PDF reflow joins wrapped lines and fixes hyphenation', () => {
  const raw =
    'This is a long line of text that wraps around because the page is narrow and authen-\ntication matters a lot here.\nShort heading\nNext paragraph starts here and continues for a while longer than before.';
  const out = reflowPdfText(raw);
  assert.match(out, /authentication matters/);
  assert.ok(out.includes('\n\nShort heading\n\n'));
});

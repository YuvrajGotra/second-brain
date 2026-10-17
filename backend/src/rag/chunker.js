import { splitSentences, estimateTokens } from './textUtils.js';

/**
 * Structure-aware recursive chunker.
 *
 *   segments (pages / markdown sections / transcript passages)
 *      → paragraphs → sentences → words   (only split as finely as needed)
 *      → greedily packed into chunks of ≤ chunkSize characters
 *      → consecutive chunks share ~chunkOverlap characters of whole sentences
 *
 * Rules that preserve meaning:
 *  - never cut mid-sentence unless a single sentence exceeds chunkSize
 *  - never merge across markdown/transcript sections (a heading starts a new chunk)
 *  - chunks MAY flow across PDF pages; they record page_number..page_end
 *
 * @param {{text:string,pageNumber?:number,section?:string|null}[]} segments
 * @param {{chunkSize:number, chunkOverlap:number}} options
 * @returns {{content:string,pageNumber:number|null,pageEnd:number|null,section:string|null,chunkIndex:number,tokenEstimate:number}[]}
 */
export function chunkSegments(segments, { chunkSize = 1000, chunkOverlap = 150 } = {}) {
  if (chunkOverlap >= chunkSize / 2) throw new Error('chunkOverlap must be < chunkSize / 2');

  const units = toUnits(segments, chunkSize);
  const chunks = [];
  let current = [];
  let currentLength = 0;

  const emit = () => {
    if (!current.length) return;
    chunks.push(buildChunk(current));
    current = [];
    currentLength = 0;
  };

  for (const unit of units) {
    const sectionChanged = current.length > 0 && unit.section !== current[0].section;
    if (sectionChanged) emit();

    const projected = currentLength + unit.text.length + (current.length ? 2 : 0);
    if (current.length && projected > chunkSize) {
      const tail = overlapTail(current, chunkOverlap);
      emit();
      if (tailLength(tail) + unit.text.length + 2 <= chunkSize) {
        current = tail;
        currentLength = tailLength(tail);
      }
    }
    current.push(unit);
    currentLength += unit.text.length + (current.length > 1 ? 2 : 0);
  }
  emit();

  mergeTinyTrailingChunk(chunks, chunkSize);
  return chunks.map((c, i) => ({ ...c, chunkIndex: i, tokenEstimate: estimateTokens(c.content) }));
}

/** Break segments into the largest pieces that fit: paragraph → sentence → word window. */
function toUnits(segments, chunkSize) {
  const units = [];
  for (const seg of segments) {
    const meta = { pageNumber: seg.pageNumber ?? null, section: seg.section ?? null };
    const paragraphs = seg.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      if (paragraph.length <= chunkSize) {
        units.push({ text: paragraph, newParagraph: true, ...meta });
        continue;
      }
      let first = true;
      for (const sentence of splitSentences(paragraph)) {
        for (const piece of sentence.length <= chunkSize ? [sentence] : splitByWords(sentence, chunkSize)) {
          units.push({ text: piece, newParagraph: first, ...meta });
          first = false;
        }
      }
    }
  }
  return units;
}

function splitByWords(text, max) {
  const pieces = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (current && current.length + word.length + 1 > max) {
      pieces.push(current);
      current = '';
    }
    // A single "word" longer than max (e.g. a minified blob) is hard-cut.
    if (word.length > max) {
      for (let i = 0; i < word.length; i += max) pieces.push(word.slice(i, i + max));
      continue;
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Take whole sentences from the end of the chunk until the overlap budget is used. */
function overlapTail(units, budget) {
  if (budget <= 0) return [];
  const sentences = [];
  for (let u = units.length - 1; u >= 0; u--) {
    const unitSentences = splitSentences(units[u].text);
    for (let s = unitSentences.length - 1; s >= 0; s--) {
      const text = unitSentences[s];
      if (tailLength(sentences) + text.length + 1 > budget) return sentences;
      sentences.unshift({ ...units[u], text, newParagraph: false });
    }
  }
  return sentences;
}

const tailLength = (units) => units.reduce((n, u, i) => n + u.text.length + (i ? 1 : 0), 0);

function buildChunk(units) {
  const content = units.map((u, i) => (i === 0 ? u.text : `${u.newParagraph ? '\n\n' : ' '}${u.text}`)).join('');
  const pages = units.map((u) => u.pageNumber).filter((p) => p != null);
  return {
    content,
    pageNumber: pages.length ? Math.min(...pages) : null,
    pageEnd: pages.length ? Math.max(...pages) : null,
    section: units[0].section,
  };
}

/** Avoid a near-empty final chunk by folding it into its predecessor when it fits. */
function mergeTinyTrailingChunk(chunks, chunkSize) {
  if (chunks.length < 2) return;
  const last = chunks[chunks.length - 1];
  const prev = chunks[chunks.length - 2];
  if (last.content.length < chunkSize * 0.15 && last.section === prev.section) {
    if (prev.content.length + last.content.length + 2 <= chunkSize * 1.2) {
      prev.content = `${prev.content}\n\n${last.content}`;
      prev.pageEnd = last.pageEnd ?? prev.pageEnd;
      chunks.pop();
    }
  }
}

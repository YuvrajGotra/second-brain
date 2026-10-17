/**
 * Text normalisation shared by every extractor. The goal is retrieval-friendly
 * text: consistent whitespace, real paragraph boundaries, no layout artefacts.
 */

export function normalizeText(text) {
  return (
    text
      .normalize('NFKC')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[  -​  　]/g, ' ')
      .replace(/﻿/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * PDF text arrives as hard-wrapped visual lines. Re-flow them into paragraphs:
 * join a line to the previous one unless the previous line looks like the end
 * of a paragraph (short + terminal punctuation) or the current line is a heading
 * or list item. Also repairs words hyphenated across line breaks.
 */
export function reflowPdfText(text) {
  const lines = normalizeText(text).split('\n');
  const typicalWidth = median(lines.filter((l) => l.length > 20).map((l) => l.length)) || 80;

  const paragraphs = [];
  let current = '';
  let prevLine = ''; // last *visual* line, used to judge paragraph ends
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current) paragraphs.push(current);
      current = '';
      continue;
    }
    if (!current) {
      current = line;
      prevLine = line;
      continue;
    }
    const prevIsShort = prevLine.length < typicalWidth * 0.75;
    const prevContinues = /[,\-–(]$/.test(prevLine) || /\b(and|or|the|of|to|a|an|with|for)$/i.test(prevLine);
    const looksLikeListItem = /^([-•▪*]|\d+[.)]|[a-z][.)])\s/.test(line);

    // A short visual line is the end of a paragraph or a heading — unless it obviously continues.
    if ((prevIsShort && !prevContinues) || looksLikeListItem) {
      paragraphs.push(current);
      current = line;
    } else if (/[A-Za-z]-$/.test(current) && /^[a-z]/.test(line)) {
      current = current.slice(0, -1) + line; // "authenti-\ncation" → "authentication"
    } else {
      current += ` ${line}`;
    }
    prevLine = line;
  }
  if (current) paragraphs.push(current);
  return paragraphs.join('\n\n');
}

/**
 * Removes running headers/footers: short lines that repeat on most pages,
 * plus bare page numbers ("12", "Page 12", "12 / 40").
 */
export function stripRepeatedPageLines(pages) {
  if (pages.length < 3) return pages.map(stripPageNumbers);
  const counts = new Map();
  for (const page of pages) {
    const edges = new Set(
      page
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && l.length < 80),
    );
    for (const l of edges) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const threshold = Math.ceil(pages.length * 0.6);
  const repeated = new Set([...counts].filter(([, c]) => c >= threshold).map(([l]) => l));
  return pages.map((page) =>
    stripPageNumbers(
      page
        .split('\n')
        .filter((l) => !repeated.has(l.trim()))
        .join('\n'),
    ),
  );
}

function stripPageNumbers(page) {
  return page
    .split('\n')
    .filter((l) => !/^\s*(page\s*)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?\s*$/i.test(l))
    .join('\n');
}

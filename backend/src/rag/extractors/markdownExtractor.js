import { normalizeText } from '../textCleaner.js';

/** Turn inline markdown into readable plain text while keeping its meaning. */
export function stripInlineMarkdown(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // links → link text
    .replace(/<\/?[a-z][^>]*>/gi, '') // inline HTML tags
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_](?!\s)(.+?)(?<!\s)[*_](?=[^*\w]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '- ')
    .replace(/^\s*([-*_])\s*\1\s*\1[\s\1]*$/gm, '') // horizontal rules
    .replace(/^\|?[\s:-]+\|[\s|:-]*$/gm, '') // table separator rows
    .replace(/\|/g, ' | ');
}

/**
 * Splits markdown by headings so each section becomes its own segment. The
 * heading path ("Auth > JWT > Refresh tokens") is kept for citations and is a
 * strong retrieval signal. Fenced code blocks are preserved verbatim.
 */
export function extractMarkdown(content) {
  const source = content.replace(/^---\n[\s\S]*?\n---\n/, ''); // YAML front-matter
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  const segments = [];
  const headingPath = [];
  let buffer = []; // { text, code } — code lines bypass inline-markdown stripping
  let inFence = false;

  const flush = () => {
    const joined = buffer.map((l) => (l.code ? l.text : stripInlineMarkdown(l.text))).join('\n');
    const text = normalizeText(joined);
    if (text) segments.push({ text, section: headingPath.filter(Boolean).join(' > ') || null });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      buffer.push({ text: line.trim(), code: true });
      continue;
    }
    if (inFence) {
      buffer.push({ text: line, code: true });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      headingPath.length = level - 1;
      headingPath[level - 1] = stripInlineMarkdown(heading[2]).trim();
      continue;
    }
    buffer.push({ text: line, code: false });
  }
  flush();
  return { segments };
}

import { normalizeText } from '../textCleaner.js';

/** Plain text: paragraphs are already separated by blank lines. */
export function extractPlainText(content) {
  const text = normalizeText(content);
  return { segments: text ? [{ text }] : [] };
}

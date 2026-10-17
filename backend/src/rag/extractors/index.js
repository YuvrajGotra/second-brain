import path from 'node:path';
import { extractPdf } from './pdfExtractor.js';
import { extractPlainText } from './textExtractor.js';
import { extractMarkdown } from './markdownExtractor.js';
import { extractTranscript, looksLikeTranscript } from './transcriptExtractor.js';
import { AppError } from '../../utils/AppError.js';

/** Extension → logical file type. Anything not listed is rejected at upload. */
export const SUPPORTED_EXTENSIONS = {
  '.pdf': 'pdf',
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.vtt': 'transcript',
  '.srt': 'transcript',
};

export function detectFileType(originalName) {
  return SUPPORTED_EXTENSIONS[path.extname(originalName).toLowerCase()] ?? null;
}

function decodeUtf8(buffer) {
  if (buffer.includes(0)) throw AppError.unprocessable('File appears to be binary, not text');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Fall back to latin1 for legacy-encoded text files rather than failing outright.
    return buffer.toString('latin1');
  }
}

/**
 * Dispatches to the right extractor. Returns { fileType, segments, pageCount? }
 * where each segment is { text, pageNumber?, section? }.
 * A .txt that looks like a timestamped transcript is promoted to "transcript".
 */
export async function extractDocument(buffer, fileType) {
  if (fileType === 'pdf') {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw AppError.unprocessable('File is not a valid PDF');
    }
    try {
      return { fileType, ...(await extractPdf(buffer)) };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unprocessable('Could not read this PDF. It may be corrupted or password-protected.');
    }
  }

  const content = decodeUtf8(buffer);
  if (fileType === 'markdown') return { fileType, ...extractMarkdown(content) };
  if (fileType === 'transcript' || (fileType === 'text' && looksLikeTranscript(content))) {
    return { fileType: 'transcript', ...extractTranscript(content) };
  }
  return { fileType, ...extractPlainText(content) };
}

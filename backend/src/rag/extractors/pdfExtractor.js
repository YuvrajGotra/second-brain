import { extractText, getDocumentProxy } from 'unpdf';
import { reflowPdfText, stripRepeatedPageLines } from '../textCleaner.js';

/** Extracts text page-by-page so every chunk can cite its page number. */
export async function extractPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = stripRepeatedPageLines(text);
  const segments = pages
    .map((pageText, i) => ({ text: reflowPdfText(pageText), pageNumber: i + 1 }))
    .filter((s) => s.text.length > 0);
  return { segments, pageCount: totalPages };
}

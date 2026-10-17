import fs from 'node:fs/promises';
import { env } from '../config/env.js';
import { withTransaction } from '../config/database.js';
import { ai } from '../rag/aiProvider.js';
import { extractDocument } from '../rag/extractors/index.js';
import { extractMarkdown } from '../rag/extractors/markdownExtractor.js';
import { chunkSegments } from '../rag/chunker.js';
import * as documentModel from '../models/documentModel.js';
import * as noteModel from '../models/noteModel.js';
import * as chunkModel from '../models/chunkModel.js';
import { resolveStoredPath } from './storageService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const MAX_CHUNKS_PER_SOURCE = 5000;

/**
 * "Contextual chunk header": the embedded text carries the section (and note
 * tags) alongside the source title, so a chunk that says "it expires after 15
 * minutes" still lands near queries about "JWT access tokens". The stored
 * content stays raw for display and prompting.
 */
export function buildEmbeddingInput(sourceTitle, chunk, extra) {
  const header = [];
  if (chunk.section) header.push(`Section: ${chunk.section}`);
  if (extra) header.push(extra);
  return { title: sourceTitle, text: header.length ? `${header.join('\n')}\n\n${chunk.content}` : chunk.content };
}

async function embedChunks(sourceTitle, chunks, extra) {
  const vectors = await ai.embedDocuments(chunks.map((c) => buildEmbeddingInput(sourceTitle, c, extra)));
  if (vectors.length !== chunks.length) throw new Error('Embedding count mismatch');
  return chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
}

const chunkOptions = () => ({ chunkSize: env.CHUNK_SIZE, chunkOverlap: env.CHUNK_OVERLAP });

/** Full pipeline for an uploaded file: read → extract → clean → chunk → embed → store. */
export async function processDocument(documentId) {
  const doc = await documentModel.findForProcessing(documentId);
  if (!doc) return; // deleted while queued
  const started = Date.now();

  await withTransaction((c) => documentModel.setStatus(c, doc.id, 'processing'));

  const buffer = await fs.readFile(resolveStoredPath(doc.storage_path));
  const extracted = await extractDocument(buffer, doc.file_type);
  const charCount = extracted.segments.reduce((n, s) => n + s.text.length, 0);
  if (charCount === 0) {
    throw AppError.unprocessable(
      doc.file_type === 'pdf'
        ? 'No extractable text found. The PDF may be scanned images (OCR is not supported yet).'
        : 'The file is empty.',
    );
  }

  const chunks = chunkSegments(extracted.segments, chunkOptions());
  if (chunks.length > MAX_CHUNKS_PER_SOURCE) {
    throw AppError.unprocessable(`Document is too large to index (${chunks.length} chunks).`);
  }
  const embedded = await embedChunks(doc.title, chunks);

  // Swap old chunks for new ones atomically (supports re-processing).
  const stillExists = await withTransaction(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM documents WHERE id = $1 FOR UPDATE', [doc.id]);
    if (!rowCount) return false;
    await chunkModel.deleteForSource(client, { documentId: doc.id });
    await chunkModel.insertMany(client, { userId: doc.user_id, documentId: doc.id }, embedded);
    await documentModel.setStatus(client, doc.id, 'indexed', {
      chunkCount: embedded.length,
      pageCount: extracted.pageCount ?? null,
      charCount,
      fileType: extracted.fileType,
    });
    return true;
  });

  if (stillExists) {
    logger.info(`Indexed document ${doc.id}: ${embedded.length} chunks in ${Date.now() - started}ms`);
  }
}

/** Notes reuse the same chunk → embed → store pipeline (markdown-aware). */
export async function processNote(noteId) {
  const note = await noteModel.findForProcessing(noteId);
  if (!note) return;

  if (!note.index_enabled) {
    await withTransaction(async (client) => {
      await chunkModel.deleteForSource(client, { noteId: note.id });
      await noteModel.setIndexStatus(client, note.id, 'disabled', { chunkCount: 0 });
    });
    return;
  }

  await withTransaction((c) => noteModel.setIndexStatus(c, note.id, 'processing'));
  const { segments } = extractMarkdown(note.content || '');
  const chunks = segments.length ? chunkSegments(segments, chunkOptions()) : [];
  const tagLine = note.tags.length ? `Tags: ${note.tags.join(', ')}` : undefined;
  const embedded = chunks.length ? await embedChunks(note.title, chunks, tagLine) : [];

  await withTransaction(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM notes WHERE id = $1 FOR UPDATE', [note.id]);
    if (!rowCount) return;
    await chunkModel.deleteForSource(client, { noteId: note.id });
    await chunkModel.insertMany(client, { userId: note.user_id, noteId: note.id }, embedded);
    await noteModel.setIndexStatus(client, note.id, 'indexed', { chunkCount: embedded.length });
  });
}

/** Called by the worker once a job has exhausted its retries. */
export async function markFailed(job, message) {
  await withTransaction(async (client) => {
    if (job.document_id) await documentModel.setStatus(client, job.document_id, 'failed', { errorMessage: message });
    if (job.note_id) await noteModel.setIndexStatus(client, job.note_id, 'failed', { error: message });
  });
}

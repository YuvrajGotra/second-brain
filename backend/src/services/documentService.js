import fs from 'node:fs/promises';
import path from 'node:path';
import { withTransaction } from '../config/database.js';
import * as documentModel from '../models/documentModel.js';
import * as chunkModel from '../models/chunkModel.js';
import * as jobModel from '../models/jobModel.js';
import { removeFile, toStoredPath, resolveStoredPath } from './storageService.js';
import { notifyNewJob } from '../workers/ingestionWorker.js';
import { AppError } from '../utils/AppError.js';

function titleFromFilename(name) {
  // eslint-disable-next-line no-control-regex
  const base = path.basename(name, path.extname(name)).replace(/[\u0000-\u001F]/g, '').trim();
  return (base || 'Untitled').slice(0, 200);
}

async function assertMagicBytes(file) {
  if (file.detectedType !== 'pdf') return;
  const handle = await fs.open(file.path, 'r');
  try {
    const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 0);
    if (buffer.toString('latin1') !== '%PDF-') {
      throw AppError.unprocessable(`"${file.originalname}" is not a valid PDF file.`);
    }
  } finally {
    await handle.close();
  }
}

/**
 * Registers uploaded files and queues them for background ingestion.
 * Each file is handled independently: one bad file doesn't fail the batch.
 */
export async function registerUploads(userId, files) {
  const documents = [];
  const errors = [];

  for (const file of files) {
    try {
      await assertMagicBytes(file);
      if (file.size === 0) throw AppError.unprocessable(`"${file.originalname}" is empty.`);

      const document = await withTransaction(async (client) => {
        const doc = await documentModel.create(client, {
          userId,
          title: titleFromFilename(file.originalname),
          originalName: file.originalname.slice(0, 255),
          fileType: file.detectedType,
          mimeType: file.mimetype || null,
          sizeBytes: file.size,
          storagePath: toStoredPath(file.path),
        });
        await jobModel.enqueue(client, { userId, documentId: doc.id });
        return doc;
      });
      documents.push(document);
    } catch (err) {
      await fs.unlink(file.path).catch(() => {});
      if (!(err instanceof AppError)) throw err;
      errors.push({ file: file.originalname, message: err.message });
    }
  }

  if (documents.length) notifyNewJob();
  return { documents, errors };
}

export const listDocuments = (userId, opts) => documentModel.list(userId, opts);

export async function getDocument(userId, id, chunkPage) {
  const document = await documentModel.findById(userId, id);
  if (!document) throw AppError.notFound('Document');
  const chunks = await chunkModel.listForDocument(userId, id, chunkPage);
  return { document, chunks };
}

export async function getDocumentFile(userId, id) {
  const record = await documentModel.findStoragePath(userId, id);
  if (!record) throw AppError.notFound('Document');
  const fullPath = resolveStoredPath(record.storage_path);
  try {
    await fs.access(fullPath);
  } catch {
    throw AppError.notFound('Original file');
  }
  return { ...record, fullPath };
}

export async function renameDocument(userId, id, title) {
  const doc = await documentModel.rename(userId, id, title);
  if (!doc) throw AppError.notFound('Document');
  return doc;
}

export async function reprocessDocument(userId, id) {
  const doc = await documentModel.findById(userId, id);
  if (!doc) throw AppError.notFound('Document');
  if (doc.status === 'processing' || doc.status === 'queued') {
    throw AppError.conflict('Document is already being processed');
  }
  await withTransaction(async (client) => {
    await documentModel.setStatus(client, id, 'queued');
    await jobModel.enqueue(client, { userId, documentId: id });
  });
  notifyNewJob();
  return documentModel.findById(userId, id);
}

/** Deletes the row (chunks + embeddings + jobs cascade) and then the file on disk. */
export async function deleteDocument(userId, id) {
  const deleted = await documentModel.remove(userId, id);
  if (!deleted) throw AppError.notFound('Document');
  await removeFile(deleted.storage_path);
}

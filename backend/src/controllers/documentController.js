import * as documentService from '../services/documentService.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/response.js';

export async function upload(req, res) {
  if (!req.files?.length) throw AppError.badRequest('No files uploaded. Use the "files" form field.');
  const { documents, errors } = await documentService.registerUploads(req.user.id, req.files);
  if (!documents.length) {
    throw AppError.unprocessable(errors[0]?.message ?? 'No valid files uploaded', errors);
  }
  // 202 Accepted: files are stored, indexing continues in the background.
  ok(res, { documents, errors }, { status: 202 });
}

export async function list(req, res) {
  const { limit, offset, status, q } = req.validated.query;
  const { items, total } = await documentService.listDocuments(req.user.id, { limit, offset, status, q });
  ok(res, items, { meta: { total, limit, offset } });
}

export async function get(req, res) {
  const { limit, offset } = req.validated.query;
  ok(res, await documentService.getDocument(req.user.id, req.validated.params.id, { limit, offset }));
}

const SAFE_CONTENT_TYPES = { pdf: 'application/pdf' };

export async function file(req, res) {
  const doc = await documentService.getDocumentFile(req.user.id, req.validated.params.id);
  // Text formats are always served as text/plain so uploaded content can never execute as HTML.
  res.setHeader('Content-Type', SAFE_CONTENT_TYPES[doc.file_type] ?? 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  // Browsers' built-in PDF viewers are blocked by Helmet's strict CSP (object-src 'none'),
  // so relax it for PDFs only. Text files keep the strict CSP plus text/plain + nosniff.
  if (doc.file_type === 'pdf') res.removeHeader('Content-Security-Policy');
  res.sendFile(doc.fullPath);
}

export async function rename(req, res) {
  ok(res, await documentService.renameDocument(req.user.id, req.validated.params.id, req.validated.body.title));
}

export async function reprocess(req, res) {
  ok(res, await documentService.reprocessDocument(req.user.id, req.validated.params.id), { status: 202 });
}

export async function remove(req, res) {
  await documentService.deleteDocument(req.user.id, req.validated.params.id);
  ok(res, { deleted: true });
}

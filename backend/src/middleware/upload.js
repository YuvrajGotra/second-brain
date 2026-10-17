import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { userDir, randomFileName } from '../services/storageService.js';
import { SUPPORTED_EXTENSIONS } from '../rag/extractors/index.js';
import { AppError } from '../utils/AppError.js';

export const MAX_FILES_PER_UPLOAD = 10;

// Browsers report wildly different MIME types for .md/.vtt/.srt, so the
// extension is the primary check and the MIME type only has to be plausible.
const ALLOWED_MIME = {
  pdf: ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
  text: ['text/plain', 'application/octet-stream', ''],
  markdown: ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream', ''],
  transcript: ['text/vtt', 'application/x-subrip', 'text/srt', 'text/plain', 'application/octet-stream', ''],
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) =>
    userDir(req.user.id)
      .then((dir) => cb(null, dir))
      .catch(cb),
  filename: (_req, file, cb) => cb(null, randomFileName(file.originalname)),
});

function fileFilter(_req, file, cb) {
  // multer decodes names as latin1; restore UTF-8 so non-English filenames survive.
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const fileType = SUPPORTED_EXTENSIONS[path.extname(file.originalname).toLowerCase()];
  if (!fileType) {
    return cb(
      AppError.unprocessable(
        `Unsupported file type "${path.extname(file.originalname) || file.originalname}". Allowed: PDF, TXT, MD, VTT, SRT.`,
      ),
    );
  }
  if (!ALLOWED_MIME[fileType].includes(file.mimetype)) {
    return cb(AppError.unprocessable(`File "${file.originalname}" has an unexpected content type (${file.mimetype}).`));
  }
  file.detectedType = fileType;
  cb(null, true);
}

export const uploadDocuments = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadBytes, files: MAX_FILES_PER_UPLOAD, fields: 5 },
}).array('files', MAX_FILES_PER_UPLOAD);

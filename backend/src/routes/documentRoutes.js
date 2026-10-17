import { Router } from 'express';
import * as documents from '../controllers/documentController.js';
import { validate } from '../middleware/validate.js';
import { uploadDocuments } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { uuidParam } from '../validators/common.js';
import { listDocumentsQuery, chunkPageQuery, renameDocumentSchema } from '../validators/documentValidators.js';

const router = Router();

router.get('/', validate({ query: listDocumentsQuery }), documents.list);
router.post('/upload', uploadLimiter, uploadDocuments, documents.upload);
router.get('/:id', validate({ params: uuidParam, query: chunkPageQuery }), documents.get);
router.get('/:id/file', validate({ params: uuidParam }), documents.file);
router.patch('/:id', validate({ params: uuidParam, body: renameDocumentSchema }), documents.rename);
router.post('/:id/reprocess', validate({ params: uuidParam }), documents.reprocess);
router.delete('/:id', validate({ params: uuidParam }), documents.remove);

export default router;

import { z } from 'zod';
import { pagination } from './common.js';

export const listDocumentsQuery = pagination.extend({
  status: z.enum(['queued', 'processing', 'indexed', 'failed']).optional(),
  q: z.string().trim().max(200).optional(),
});

export const chunkPageQuery = pagination.extend({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const renameDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
});

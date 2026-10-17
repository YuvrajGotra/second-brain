import { z } from 'zod';
import { pagination } from './common.js';

const filters = z
  .object({
    sourceType: z.enum(['all', 'documents', 'notes']).default('all'),
    documentIds: z.array(z.uuid()).max(50).optional(),
  })
  .default({ sourceType: 'all' });

export const chatSchema = z.object({
  conversationId: z.uuid().optional().nullable(),
  message: z.string().trim().min(1, 'Message cannot be empty').max(4000, 'Message is too long (max 4000 characters)'),
  filters,
});

export const searchSchema = z.object({
  query: z.string().trim().min(1, 'Search query is required').max(500),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  mode: z.enum(['hybrid', 'semantic', 'keyword']).default('hybrid'),
  sourceType: z.enum(['all', 'documents', 'notes']).default('all'),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
});

export const listConversationsQuery = pagination.extend({
  q: z.string().trim().max(120).optional(),
});

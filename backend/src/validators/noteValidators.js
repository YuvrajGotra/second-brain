import { z } from 'zod';
import { pagination } from './common.js';

const tags = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(40, 'Tags must be 40 characters or fewer')
      .regex(/^[\p{L}\p{N} _-]+$/u, 'Tags may only contain letters, numbers, spaces, - and _'),
  )
  .max(20, 'A note can have at most 20 tags')
  .transform((t) => [...new Set(t)]);

const fields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: z.string().max(200_000, 'Note is too long (max 200,000 characters)'),
  tags,
  indexEnabled: z.boolean(),
};

export const createNoteSchema = z.object({
  ...fields,
  content: fields.content.default(''),
  tags: fields.tags.default([]),
  indexEnabled: fields.indexEnabled.default(true),
});

// No defaults here: an omitted field must stay untouched, not be reset.
export const updateNoteSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const listNotesQuery = pagination.extend({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().toLowerCase().max(40).optional(),
});

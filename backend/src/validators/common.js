import { z } from 'zod';

export const uuidParam = z.object({ id: z.uuid('Invalid id') });

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

import { z } from 'zod';

export const shareTokenSchema = z.object({
  params: z.object({ shareToken: z.string().min(1) }),
});

export const publicRunSchema = z.object({
  params: z.object({ shareToken: z.string().min(1) }),
  body: z.object({
    payload: z.record(z.unknown()).optional(),
  }),
});

import { z } from 'zod';

export const manualRunSchema = z.object({
  params: z.object({ id: z.string().uuid('Workflow id must be a UUID') }),
  body: z.object({
    payload: z.record(z.unknown()).optional(),
  }),
});

export const runIdSchema = z.object({
  params: z.object({ id: z.string().uuid('Run id must be a UUID') }),
});

export const webhookSchema = z.object({
  params: z.object({ workflowId: z.string().uuid('Workflow id must be a UUID') }),
});

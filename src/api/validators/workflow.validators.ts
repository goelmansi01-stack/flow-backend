import { z } from 'zod';

// Node config schemas

const httpConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url('HTTP node URL must be a valid URL'),
  headers: z.record(z.string()).optional(),
  body: z.record(z.unknown()).optional(),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

const conditionConfigSchema = z.object({
  jsonPath: z.string().min(1, 'jsonPath is required'),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'exists']),
  value: z.unknown(),
});

const delayConfigSchema = z.object({
  delaySeconds: z
    .number()
    .int()
    .min(1, 'Delay must be at least 1 second')
    .max(86_400, 'Delay cannot exceed 24 hours'),
});

const notifyConfigSchema = z.object({
  channel: z.enum(['email', 'slack']),
  to: z.string().email().optional(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1, 'Message is required').max(5000),
});

const nodeSchema = z.object({
  id: z.string().min(1, 'Node id is required'),
  type: z.enum(['http_request', 'condition', 'delay', 'notify']),
  name: z.string().min(1).max(100),
  config: z.union([httpConfigSchema, conditionConfigSchema, delayConfigSchema, notifyConfigSchema]),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.enum(['true', 'false']).optional(),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(nodeSchema).min(1, 'Workflow must have at least one node'),
  edges: z.array(edgeSchema),
  triggerNodeId: z.string().min(1, 'triggerNodeId is required'),
});

// Route-level schemas

export const createWorkflowSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Workflow name is required' })
      .min(1)
      .max(100)
      .trim(),
    definition: workflowDefinitionSchema.optional(),
    cronExpression: z
      .string()
      .regex(
        /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
        'Invalid cron expression',
      )
      .optional(),
  }),
});

export const updateWorkflowSchema = z.object({
  params: z.object({ id: z.string().uuid('Workflow id must be a UUID') }),
  body: z.object({
    name: z.string().min(1).max(100).trim().optional(),
    definition: workflowDefinitionSchema.optional(),
    cronExpression: z.string().optional().nullable(),
  }),
});

export const workflowIdSchema = z.object({
  params: z.object({ id: z.string().uuid('Workflow id must be a UUID') }),
});

export const workflowRunsQuerySchema = z.object({
  params: z.object({ id: z.string().uuid('Workflow id must be a UUID') }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// Helpers for runtime graph validation

export function validateDefinitionGraph(definition: {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string }>;
  triggerNodeId: string;
}): string | null {
  const nodeIds = new Set(definition.nodes.map((n) => n.id));

  if (!nodeIds.has(definition.triggerNodeId)) {
    return `triggerNodeId "${definition.triggerNodeId}" does not reference a known node`;
  }

  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.from)) return `Edge references unknown node "${edge.from}"`;
    if (!nodeIds.has(edge.to)) return `Edge references unknown node "${edge.to}"`;
  }

  // Cycle detection via DFS
  const adjacency = new Map<string, string[]>();
  for (const node of definition.nodes) adjacency.set(node.id, []);
  for (const edge of definition.edges) adjacency.get(edge.from)!.push(edge.to);

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!visited.has(neighbor) && hasCycle(neighbor)) return true;
      if (inStack.has(neighbor)) return true;
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const node of definition.nodes) {
    if (!visited.has(node.id) && hasCycle(node.id)) {
      return 'Workflow definition contains a cycle';
    }
  }

  return null;
}

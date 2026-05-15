import { JSONPath } from 'jsonpath-plus';
import type { ExecutionContext, ConditionNodeConfig } from '../../lib/types';
import { AppError } from '../../lib/types';

export function conditionHandler(
  ctx: ExecutionContext,
  config: ConditionNodeConfig,
): Record<string, unknown> {
  const { jsonPath, operator, value } = config;

  // Build the object to evaluate against — merge trigger payload + all prior node outputs
  const context = {
    trigger: ctx.triggerPayload ?? {},
    nodes: ctx.nodeOutputs,
  };

  let actual: unknown;
  try {
    const results = JSONPath({ path: jsonPath, json: context });
    actual = results.length > 0 ? results[0] : undefined;
  } catch {
    throw new AppError(422, `Invalid jsonPath expression: "${jsonPath}"`, 'CONDITION_ERROR');
  }

  const result = evaluate(actual, operator, value);
  return { result, actual, operator, expected: value };
}

function evaluate(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      throw new AppError(422, `Unknown operator "${operator}"`, 'CONDITION_ERROR');
  }
}

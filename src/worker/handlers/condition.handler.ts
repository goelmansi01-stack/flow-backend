import { JSONPath } from 'jsonpath-plus';
import type { ExecutionContext, ConditionNodeConfig } from '../../lib/types';
import { AppError } from '../../lib/types';

export function conditionHandler(
  ctx: ExecutionContext,
  config: ConditionNodeConfig,
): Record<string, unknown> {
  const { expression } = config;

  const context = {
    trigger: ctx.triggerPayload ?? {},
    nodes: ctx.nodeOutputs,
  };

  let result: boolean;
  let actual: unknown;
  try {
    const results = JSONPath({ path: expression, json: context });
    actual = results.length > 0 ? results[0] : undefined;
    result = actual !== undefined && actual !== null && actual !== false && actual !== 0 && actual !== '';
  } catch {
    throw new AppError(422, `Invalid JSONPath expression: "${expression}"`, 'CONDITION_ERROR');
  }

  return { result, actual, expression };
}

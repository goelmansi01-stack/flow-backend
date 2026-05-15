import type { ExecutionContext, DelayNodeConfig } from '../../lib/types';

/**
 * The delay handler doesn't actually sleep the worker thread.
 * It signals the orchestrator to re-enqueue this run with a BullMQ delay,
 * freeing up the worker for other runs.
 */
export function delayHandler(
  _ctx: ExecutionContext,
  config: DelayNodeConfig,
): Record<string, unknown> {
  return {
    delaySeconds: config.delaySeconds,
    __flow_delay: true, // orchestrator checks this sentinel
  };
}

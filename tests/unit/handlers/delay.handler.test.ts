import { delayHandler } from '../../../src/worker/handlers/delay.handler';
import type { ExecutionContext } from '../../../src/lib/types';

const mockCtx: ExecutionContext = {
  runId: 'run-1',
  nodeId: 'node-delay',
  attempt: 1,
  triggerPayload: null,
  nodeOutputs: {},
};

describe('delayHandler', () => {
  it('returns delay sentinel with configured seconds', () => {
    const result = delayHandler(mockCtx, { delaySeconds: 30 });
    expect(result.__flow_delay).toBe(true);
    expect(result.delaySeconds).toBe(30);
  });

  it('does not sleep — returns immediately', async () => {
    const start = Date.now();
    delayHandler(mockCtx, { delaySeconds: 3600 });
    expect(Date.now() - start).toBeLessThan(50);
  });
});

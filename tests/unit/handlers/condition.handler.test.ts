import { conditionHandler } from '../../../src/worker/handlers/condition.handler';
import type { ExecutionContext } from '../../../src/lib/types';

const baseCtx: ExecutionContext = {
  runId: 'run-1',
  nodeId: 'node-cond',
  attempt: 1,
  triggerPayload: { status: 'active', score: 90 },
  nodeOutputs: {
    'node-http': { statusCode: 200, body: { role: 'admin', tags: ['vip', 'beta'] } },
  },
};

describe('conditionHandler', () => {
  it('evaluates eq operator correctly', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.status',
      operator: 'eq',
      value: 'active',
    });
    expect(result.result).toBe(true);
  });

  it('evaluates neq operator correctly', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.status',
      operator: 'neq',
      value: 'inactive',
    });
    expect(result.result).toBe(true);
  });

  it('evaluates gt operator on numeric value', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.score',
      operator: 'gt',
      value: 80,
    });
    expect(result.result).toBe(true);
  });

  it('evaluates lt operator on numeric value', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.score',
      operator: 'lt',
      value: 50,
    });
    expect(result.result).toBe(false);
  });

  it('evaluates contains on a string', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.status',
      operator: 'contains',
      value: 'act',
    });
    expect(result.result).toBe(true);
  });

  it('evaluates contains on an array', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.nodes.node-http.body.tags',
      operator: 'contains',
      value: 'vip',
    });
    expect(result.result).toBe(true);
  });

  it('evaluates exists for a present field', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.status',
      operator: 'exists',
      value: null,
    });
    expect(result.result).toBe(true);
  });

  it('evaluates exists as false for missing field', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.missingField',
      operator: 'exists',
      value: null,
    });
    expect(result.result).toBe(false);
  });

  it('returns actual value and expected in output', () => {
    const result = conditionHandler(baseCtx, {
      jsonPath: '$.trigger.status',
      operator: 'eq',
      value: 'active',
    });
    expect(result.actual).toBe('active');
    expect(result.expected).toBe('active');
    expect(result.operator).toBe('eq');
  });

  it('throws on unknown operator', () => {
    expect(() =>
      conditionHandler(baseCtx, {
        jsonPath: '$.trigger.status',
        operator: 'unknown_op' as any,
        value: 'x',
      }),
    ).toThrow('Unknown operator');
  });
});

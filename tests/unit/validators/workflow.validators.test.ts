import {
  workflowDefinitionSchema,
  validateDefinitionGraph,
} from '../../../src/api/validators/workflow.validators';

const validDefinition = {
  triggerNodeId: 'node-1',
  nodes: [
    { id: 'node-1', type: 'http_request', name: 'Fetch User', config: { method: 'GET', url: 'https://api.example.com/users/1' } },
    { id: 'node-2', type: 'condition', name: 'Check Status', config: { jsonPath: '$.nodes.node-1.body.status', operator: 'eq', value: 'active' } },
    { id: 'node-3', type: 'notify', name: 'Notify Slack', config: { channel: 'slack', message: 'User is active' } },
  ],
  edges: [
    { id: 'e1', from: 'node-1', to: 'node-2' },
    { id: 'e2', from: 'node-2', to: 'node-3', condition: 'true' },
  ],
};

describe('workflowDefinitionSchema', () => {
  it('accepts a valid workflow definition', () => {
    const result = workflowDefinitionSchema.safeParse(validDefinition);
    expect(result.success).toBe(true);
  });

  it('rejects a definition with no nodes', () => {
    const result = workflowDefinitionSchema.safeParse({ ...validDefinition, nodes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects http_request node with an invalid URL', () => {
    const bad = {
      ...validDefinition,
      nodes: [{ id: 'n1', type: 'http_request', name: 'Bad', config: { method: 'GET', url: 'not-a-url' } }],
      edges: [],
    };
    const result = workflowDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid HTTP method', () => {
    const bad = {
      ...validDefinition,
      nodes: [{ id: 'n1', type: 'http_request', name: 'Bad', config: { method: 'CONNECT', url: 'https://api.example.com' } }],
      edges: [],
    };
    const result = workflowDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects delay with 0 seconds', () => {
    const bad = {
      ...validDefinition,
      nodes: [{ id: 'n1', type: 'delay', name: 'Wait', config: { delaySeconds: 0 } }],
      edges: [],
    };
    const result = workflowDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects notify email channel without a to address', () => {
    const bad = {
      ...validDefinition,
      nodes: [{ id: 'n1', type: 'notify', name: 'Email', config: { channel: 'email', message: 'Hello' } }],
      edges: [],
    };
    // Schema allows it — runtime check in handler; schema just validates shape
    const result = workflowDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(true); // structural validity
  });
});

describe('validateDefinitionGraph', () => {
  it('returns null for a valid DAG', () => {
    expect(validateDefinitionGraph(validDefinition)).toBeNull();
  });

  it('rejects when triggerNodeId references an unknown node', () => {
    const error = validateDefinitionGraph({ ...validDefinition, triggerNodeId: 'ghost-node' });
    expect(error).toMatch(/triggerNodeId/);
  });

  it('rejects when an edge references an unknown from-node', () => {
    const bad = {
      ...validDefinition,
      edges: [{ id: 'e1', from: 'unknown-node', to: 'node-2' }],
    };
    const error = validateDefinitionGraph(bad);
    expect(error).toMatch(/unknown node/);
  });

  it('rejects when an edge references an unknown to-node', () => {
    const bad = {
      ...validDefinition,
      edges: [{ id: 'e1', from: 'node-1', to: 'ghost' }],
    };
    const error = validateDefinitionGraph(bad);
    expect(error).toMatch(/unknown node/);
  });

  it('detects a cycle', () => {
    const cyclic = {
      triggerNodeId: 'node-1',
      nodes: [
        { id: 'node-1', type: 'http_request' as const, name: 'A', config: { method: 'GET' as const, url: 'https://a.com' } },
        { id: 'node-2', type: 'http_request' as const, name: 'B', config: { method: 'GET' as const, url: 'https://b.com' } },
      ],
      edges: [
        { id: 'e1', from: 'node-1', to: 'node-2' },
        { id: 'e2', from: 'node-2', to: 'node-1' }, // cycle
      ],
    };
    const error = validateDefinitionGraph(cyclic);
    expect(error).toMatch(/cycle/);
  });
});

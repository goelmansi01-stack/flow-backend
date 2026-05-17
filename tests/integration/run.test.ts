import request from 'supertest';
import app from '../../src/api/app';
import { createTestUser, authHeader, sampleDefinition, cleanTable, prisma } from '../helpers';

// Mock the queue so integration tests don't need a live Redis
jest.mock('../../src/lib/queue', () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: 'mock-job-id' });
  const mockClose = jest.fn().mockResolvedValue(undefined);
  return {
    QUEUE_NAME: 'workflow-runs',
    createRunQueue: () => ({ add: mockAdd, close: mockClose }),
    createRedisConnection: jest.fn(),
    createQueueEvents: jest.fn(),
  };
});

let accessToken: string;
let workflowId: string;

beforeEach(async () => {
  await cleanTable('node_executions', 'runs', 'webhook_deliveries', 'workflow_versions', 'workflows', 'users');
  const user = await createTestUser();
  accessToken = user.accessToken;

  const wf = await request(app)
    .post('/api/workflows')
    .set(authHeader(accessToken))
    .send({ name: 'Test WF', definition: sampleDefinition });
  workflowId = wf.body.workflow.id;

  await request(app)
    .post(`/api/workflows/${workflowId}/publish`)
    .set(authHeader(accessToken));
});

describe('POST /api/workflows/:id/run', () => {
  it('enqueues a manual run and returns 202 with runId', async () => {
    const res = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set(authHeader(accessToken))
      .send({ payload: { source: 'test' } });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
    expect(res.body.status).toBe('queued');
  });

  it('rejects running an unpublished workflow with 409', async () => {
    const wf2 = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'Draft WF' });

    const res = await request(app)
      .post(`/api/workflows/${wf2.body.workflow.id}/run`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WORKFLOW_NOT_PUBLISHED');
  });
});

describe('GET /api/runs/:id', () => {
  it('returns run details with node executions', async () => {
    const trigger = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set(authHeader(accessToken));
    const { runId } = trigger.body;

    const res = await request(app)
      .get(`/api/runs/${runId}`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.run.id).toBe(runId);
    expect(res.body.run.nodeExecutions).toBeDefined();
  });

  it('returns 404 for a run owned by another user', async () => {
    const trigger = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set(authHeader(accessToken));
    const { runId } = trigger.body;

    const other = await createTestUser('other@example.com');
    const res = await request(app)
      .get(`/api/runs/${runId}`)
      .set(authHeader(other.accessToken));

    expect(res.status).toBe(404);
  });
});

describe('POST /api/runs/:id/cancel', () => {
  it('cancels a queued run', async () => {
    const trigger = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set(authHeader(accessToken));
    const { runId } = trigger.body;

    const res = await request(app)
      .post(`/api/runs/${runId}/cancel`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);

    const run = await prisma.run.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('cancelled');
  });

  it('returns 409 when cancelling an already-cancelled run', async () => {
    const trigger = await request(app)
      .post(`/api/workflows/${workflowId}/run`)
      .set(authHeader(accessToken));
    const { runId } = trigger.body;

    await request(app).post(`/api/runs/${runId}/cancel`).set(authHeader(accessToken));
    const res = await request(app).post(`/api/runs/${runId}/cancel`).set(authHeader(accessToken));

    expect(res.status).toBe(409);
  });
});

describe('POST /api/hooks/:workflowId', () => {
  it('accepts a valid webhook with correct secret', async () => {
    const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });

    const res = await request(app)
      .post(`/api/hooks/${workflowId}`)
      .set('X-Secret', wf!.webhookSecret!)
      .set('X-Request-Id', 'unique-request-001')
      .send({ event: 'order.created' });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
  });

  it('rejects webhook with wrong secret', async () => {
    const res = await request(app)
      .post(`/api/hooks/${workflowId}`)
      .set('X-Secret', 'wrong-secret')
      .send({});
    expect(res.status).toBe(401);
  });

  it('de-duplicates webhook by request ID', async () => {
    const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });

    await request(app)
      .post(`/api/hooks/${workflowId}`)
      .set('X-Secret', wf!.webhookSecret!)
      .set('X-Request-Id', 'dup-request-id')
      .send({});

    const res = await request(app)
      .post(`/api/hooks/${workflowId}`)
      .set('X-Secret', wf!.webhookSecret!)
      .set('X-Request-Id', 'dup-request-id')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Duplicate/);
  });
});

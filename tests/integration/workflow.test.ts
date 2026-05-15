import request from 'supertest';
import app from '../../src/api/app';
import { createTestUser, authHeader, sampleDefinition, cleanTable } from '../helpers';

let accessToken: string;

beforeEach(async () => {
  await cleanTable('node_executions', 'runs', 'webhook_deliveries', 'workflow_versions', 'workflows', 'users');
  const user = await createTestUser();
  accessToken = user.accessToken;
});

describe('POST /api/workflows', () => {
  it('creates a draft workflow', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'My Workflow', definition: sampleDefinition });

    expect(res.status).toBe(201);
    expect(res.body.workflow).toMatchObject({ name: 'My Workflow', status: 'draft' });
    expect(res.body.workflow.webhookSecret).toBeDefined();
  });

  it('rejects missing name with 422', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({});
    expect(res.status).toBe(422);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/workflows').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/workflows', () => {
  it('returns the list of user workflows', async () => {
    await request(app).post('/api/workflows').set(authHeader(accessToken)).send({ name: 'W1' });
    await request(app).post('/api/workflows').set(authHeader(accessToken)).send({ name: 'W2' });

    const res = await request(app).get('/api/workflows').set(authHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.workflows).toHaveLength(2);
  });
});

describe('PATCH /api/workflows/:id', () => {
  it('updates a draft workflow name', async () => {
    const create = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'Old Name' });
    const { id } = create.body.workflow;

    const res = await request(app)
      .patch(`/api/workflows/${id}`)
      .set(authHeader(accessToken))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.workflow.name).toBe('New Name');
  });

  it('rejects non-UUID id with 422', async () => {
    const res = await request(app)
      .patch('/api/workflows/not-a-uuid')
      .set(authHeader(accessToken))
      .send({ name: 'x' });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/workflows/:id/publish', () => {
  it('publishes a workflow with a valid definition', async () => {
    const create = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'W', definition: sampleDefinition });
    const { id } = create.body.workflow;

    const res = await request(app)
      .post(`/api/workflows/${id}/publish`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.version.versionNumber).toBe(1);
  });

  it('rejects publishing a workflow with no definition', async () => {
    const create = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'Empty' });
    const { id } = create.body.workflow;

    const res = await request(app)
      .post(`/api/workflows/${id}/publish`)
      .set(authHeader(accessToken));

    expect(res.status).toBe(422);
  });

  it('rejects editing a published workflow with 409', async () => {
    const create = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'W', definition: sampleDefinition });
    const { id } = create.body.workflow;

    await request(app).post(`/api/workflows/${id}/publish`).set(authHeader(accessToken));

    const res = await request(app)
      .patch(`/api/workflows/${id}`)
      .set(authHeader(accessToken))
      .send({ name: 'New Name' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WORKFLOW_PUBLISHED');
  });
});

describe('DELETE /api/workflows/:id', () => {
  it('deletes a workflow and returns 204', async () => {
    const create = await request(app)
      .post('/api/workflows')
      .set(authHeader(accessToken))
      .send({ name: 'To Delete' });
    const { id } = create.body.workflow;

    const res = await request(app).delete(`/api/workflows/${id}`).set(authHeader(accessToken));
    expect(res.status).toBe(204);

    const getRes = await request(app).get(`/api/workflows/${id}`).set(authHeader(accessToken));
    expect(getRes.status).toBe(404);
  });
});

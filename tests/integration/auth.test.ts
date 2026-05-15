import request from 'supertest';
import app from '../../src/api/app';
import { cleanTable } from '../helpers';

beforeEach(async () => {
  await cleanTable('node_executions', 'runs', 'webhook_deliveries', 'workflow_versions', 'workflows', 'users');
});

describe('POST /api/auth/signup', () => {
  it('creates a user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'Password123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: expect.any(String), accessToken: expect.any(String), refreshToken: expect.any(String) });
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'alice@example.com', password: 'Password123' });
    const res = await request(app).post('/api/auth/signup').send({ email: 'alice@example.com', password: 'Password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak password with 422', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bob@example.com', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid email with 422', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'Password123' });
    expect(res.status).toBe(422);
  });

  it('rejects missing fields with 422', async () => {
    const res = await request(app).post('/api/auth/signup').send({});
    expect(res.status).toBe(422);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/signup').send({ email: 'alice@example.com', password: 'Password123' });
  });

  it('returns tokens for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'Password123' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongPass999' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'Password123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns a new access token for a valid refresh token', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'alice@example.com', password: 'Password123' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: signup.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects an invalid refresh token with 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not.a.valid.token' });
    expect(res.status).toBe(401);
  });
});

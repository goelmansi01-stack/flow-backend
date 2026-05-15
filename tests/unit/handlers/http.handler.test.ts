import axios from 'axios';
import { httpHandler } from '../../../src/worker/handlers/http.handler';
import type { ExecutionContext } from '../../../src/lib/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockCtx: ExecutionContext = {
  runId: 'run-123',
  nodeId: 'node-1',
  attempt: 1,
  triggerPayload: { event: 'test' },
  nodeOutputs: {},
};

describe('httpHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns structured output for a successful GET', async () => {
    mockedAxios.request = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { id: 1, name: 'Alice' },
    });

    const result = await httpHandler(mockCtx, {
      method: 'GET',
      url: 'https://api.example.com/users/1',
    });

    expect(result.statusCode).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ id: 1, name: 'Alice' });
  });

  it('marks ok=false for 4xx responses without throwing', async () => {
    mockedAxios.request = jest.fn().mockResolvedValue({
      status: 404,
      headers: {},
      data: { message: 'Not found' },
    });

    const result = await httpHandler(mockCtx, {
      method: 'GET',
      url: 'https://api.example.com/missing',
    });

    expect(result.statusCode).toBe(404);
    expect(result.ok).toBe(false);
  });

  it('sends idempotency key header', async () => {
    mockedAxios.request = jest.fn().mockResolvedValue({ status: 200, headers: {}, data: {} });

    await httpHandler(mockCtx, { method: 'POST', url: 'https://api.example.com/orders', body: { qty: 1 } });

    const callArgs = (mockedAxios.request as jest.Mock).mock.calls[0][0];
    expect(callArgs.headers['X-Idempotency-Key']).toBe('run-123-node-1-1');
    expect(callArgs.headers['X-Flow-Run-Id']).toBe('run-123');
  });

  it('throws AppError when axios throws a network error', async () => {
    // axios.isAxiosError() checks the `.isAxiosError` flag, not instanceof —
    // so a plain Error with that flag works across the jest mock boundary.
    const networkError = Object.assign(new Error('Network Error'), { isAxiosError: true });
    mockedAxios.request = jest.fn().mockRejectedValue(networkError);
    (mockedAxios as any).isAxiosError = jest.fn().mockReturnValue(true);

    await expect(
      httpHandler(mockCtx, { method: 'GET', url: 'https://api.example.com/fail' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'HTTP_ERROR' });
  });
});

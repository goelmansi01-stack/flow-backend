import axios from 'axios';
import type { ExecutionContext, HttpNodeConfig } from '../../lib/types';
import { AppError } from '../../lib/types';

export async function httpHandler(
  ctx: ExecutionContext,
  config: HttpNodeConfig,
): Promise<Record<string, unknown>> {
  const { method, url, headers = {}, body, timeoutMs = 10_000 } = config;

  try {
    const response = await axios.request({
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-Flow-Run-Id': ctx.runId,
        'X-Idempotency-Key': `${ctx.runId}-${ctx.nodeId}-${ctx.attempt}`,
        ...headers,
      },
      data: body,
      timeout: timeoutMs,
      validateStatus: () => true, // don't throw on 4xx/5xx — let the workflow decide
    });

    return {
      statusCode: response.status,
      headers: response.headers,
      body: response.data,
      ok: response.status >= 200 && response.status < 300,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new AppError(502, `HTTP request failed: ${err.message}`, 'HTTP_ERROR');
    }
    throw err;
  }
}

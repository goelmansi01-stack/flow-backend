import request from 'supertest';
import app from '../src/api/app';
import { prisma } from '../src/lib/db';

export { prisma };

export async function createTestUser(email = 'test@example.com', password = 'Password123') {
  const res = await request(app).post('/api/auth/signup').send({ email, password });
  return { userId: res.body.userId, accessToken: res.body.accessToken, email };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const sampleDefinition = {
  triggerNodeId: 'node-1',
  nodes: [
    {
      id: 'node-1',
      type: 'http_request',
      name: 'Fetch Data',
      config: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1' },
    },
  ],
  edges: [],
};

export async function cleanTable(...tables: string[]) {
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

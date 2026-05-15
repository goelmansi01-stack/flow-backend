import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  // Clean up test data
  await prisma.$executeRaw`TRUNCATE TABLE node_executions, runs, webhook_deliveries, workflow_versions, workflows, users CASCADE`;
  await prisma.$disconnect();
}

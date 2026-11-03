import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Prepares the dedicated test database: applies migrations, empties every
 * table and loads the development seed. Refuses to touch any database whose
 * name does not end in "_test".
 */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/academy_test?schema=public';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.$disconnect();
  execSync('npx ts-node --transpile-only prisma/seed.ts', { cwd, env, stdio: 'pipe' });
  rmSync(path.join(cwd, 'storage/test-outbox'), { recursive: true, force: true });
}

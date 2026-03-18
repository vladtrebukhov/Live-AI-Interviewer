import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadBackendEnv } from './env.js';

loadBackendEnv();

function getDatabaseUrl(): string {
  const value = process.env['DATABASE_URL'];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('DATABASE_URL must be a non-empty string');
  }

  return value;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

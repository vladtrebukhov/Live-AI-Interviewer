import { defineConfig } from 'prisma/config';
import { loadBackendEnv } from './src/lib/env.js';

loadBackendEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});

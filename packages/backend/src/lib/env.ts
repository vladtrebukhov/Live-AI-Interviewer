import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const currentDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(currentDir, '../..');
const workspaceDir = resolve(backendDir, '../..');

export function loadBackendEnv(): void {
  const workspaceEnvPath = resolve(workspaceDir, '.env');
  const packageEnvPath = resolve(backendDir, '.env');

  config({ path: workspaceEnvPath });

  if (existsSync(packageEnvPath)) {
    config({ path: packageEnvPath, override: true });
  }
}

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(currentDir, '../..');

loadEnvConfig(workspaceDir);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_SPEECH_LOCALE: process.env.NEXT_PUBLIC_SPEECH_LOCALE,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

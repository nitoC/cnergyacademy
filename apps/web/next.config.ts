import path from 'node:path';
import type { NextConfig } from 'next';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // The academy is its own npm workspace; never resolve config from a parent project.
  turbopack: { root: path.resolve(__dirname, '../..') },
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  // Browser → /api/v1/* on the web origin → NestJS. Keeps session cookies
  // first-party and removes the need for cross-origin requests.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;

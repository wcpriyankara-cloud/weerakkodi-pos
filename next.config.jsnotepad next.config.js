/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // ⬇️ Turbopack alias (Next.js 16 dev mode)
  // ⬇️ Webpack alias (production build) — SINGLE webpack key
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
        child_process: false
      };
    }
    return config;
  },

  output: 'export',
  trailingSlash: true,

  staticPageGenerationTimeout: 120,
  images: {
    unoptimized: true
  },
  typescript: {
    ignoreBuildErrors: true
  },

  // assetPrefix: '.' for Electron production, '' for dev
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : '',
};

module.exports = nextConfig;
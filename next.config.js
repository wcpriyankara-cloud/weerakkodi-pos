/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
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

  assetPrefix: '.',
};

module.exports = nextConfig;
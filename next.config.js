const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.join(__dirname),
    resolveAlias: {
      '@': path.join(__dirname, 'src'),
    },
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'pos-catalog-gold.vercel.app' },
    ],
  },
};

module.exports = nextConfig;
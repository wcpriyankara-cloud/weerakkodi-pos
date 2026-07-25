// catalog/next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Fix multiple lockfiles warning
  turbopack: {
    root: path.join(__dirname),
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
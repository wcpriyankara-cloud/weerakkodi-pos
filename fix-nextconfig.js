const fs = require('fs');
const p = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/next.config.js';

const newConfig = `/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // ⬇️ Turbopack alias (Next.js 16 dev mode)
  turbopack: {
    resolveAlias: {
      'firebase/firestore': path.resolve(__dirname, 'lib/firestore-safe.js'),
    },
  },

  // ⬇️ Webpack alias (production build) — SINGLE webpack key
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'firebase/firestore': path.resolve(__dirname, 'lib/firestore-safe.js'),
    };
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

  // output: 'export',
  // trailingSlash: true,

  staticPageGenerationTimeout: 120,
  images: {
    unoptimized: true
  },
  typescript: {
    ignoreBuildErrors: true
  }
};

module.exports = nextConfig;
`;

fs.writeFileSync(p, newConfig, 'utf8');
console.log('✅ next.config.js rewritten:');
console.log('   - Single webpack key (merged)');
console.log('   - turbopack.resolveAlias added');
console.log('   - firestore-safe alias in both');

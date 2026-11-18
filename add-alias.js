const fs = require('fs');
const path = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/next.config.js';
let code = fs.readFileSync(path, 'utf8');

// Check if alias already exists
if (code.includes('firestore-safe')) {
  console.log('⏭️ Alias already exists');
  process.exit(0);
}

// Add webpack config with alias
const webpackConfig = `
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'firebase/firestore': require('path').resolve(__dirname, 'lib/firestore-safe.js'),
    };
    return config;
  },
`;

// Find the nextConfig object and add webpack key
if (code.includes('const nextConfig')) {
  // Insert webpack before the closing of nextConfig
  const match = code.match(/(const\s+nextConfig\s*=\s*\{)/);
  if (match) {
    code = code.replace(match[0], match[0] + '\n' + webpackConfig);
    fs.writeFileSync(path, code, 'utf8');
    console.log('✅ Added webpack alias to next.config.js');
  }
} else if (code.includes('module.exports')) {
  const match = code.match(/(module\.exports\s*=\s*\{)/);
  if (match) {
    code = code.replace(match[0], match[0] + '\n' + webpackConfig);
    fs.writeFileSync(path, code, 'utf8');
    console.log('✅ Added webpack alias to next.config.js');
  }
} else {
  console.log('⚠️ Could not find nextConfig object');
}

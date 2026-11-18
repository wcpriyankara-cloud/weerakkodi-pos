const fs = require('fs');
const p = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/next.config.js';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('firestore-safe')) { console.log('Already exists'); process.exit(0); }
const w = `  webpack: (config) => {
    const path = require('path');
    config.resolve.alias['firebase/firestore'] = path.resolve(__dirname, 'lib/firestore-safe.js');
    return config;
  },\n`;
const m = c.match(/(const\s+nextConfig\s*=\s*\{)/);
if (m) { c = c.replace(m[0], m[0] + '\n' + w); fs.writeFileSync(p, c, 'utf8'); console.log('Done!'); }
else { console.log('nextConfig not found'); }

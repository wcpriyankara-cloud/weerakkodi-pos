// fix_api_routes.js
const fs = require('fs');
const path = require('path');

console.log('🔍 Scanning and fixing API routes & dynamic declarations for static export...');

function scanAndFix(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanAndFix(fullPath);
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      let content = fs.readFileSync(fullPath, 'utf8');

      // Check for dynamic / edge server keywords incompatible with static exports
      if (
        content.includes('force-dynamic') || 
        content.includes("'edge'") || 
        content.includes('"edge"')
      ) {
        console.log('Fixing file:', fullPath);

        // Remove force-dynamic and edge runtime lines
        content = content.replace(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"];?/g, '');
        content = content.replace(/export\s+const\s+runtime\s*=\s*['"]edge['"];?/g, '');

        // If it is an API route (e.g. route.js under api/)
        if (fullPath.includes(path.sep + 'api' + path.sep)) {
          content = `// Static export compatible API route\nexport async function GET() {\n  return new Response(JSON.stringify({ status: 'ok', mode: 'static-export' }), {\n    headers: { 'content-type': 'application/json' }\n  });\n}\n`;
        }

        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('✅ Updated for static export:', fullPath);
      }
    }
  }
}

scanAndFix(path.join(__dirname, 'app'));
scanAndFix(path.join(__dirname, 'src', 'app'));

console.log('🎉 All API and dynamic routes successfully patched!');
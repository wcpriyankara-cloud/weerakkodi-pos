const fs = require('fs');
const f = 'lib/syncService.js';
if (!fs.existsSync(f)) {
  // Try other paths
  const paths = ['lib/syncService.js', 'shared/syncService.js', 'utils/syncService.js', 'services/syncService.js'];
  for (const p of paths) {
    if (fs.existsSync(p)) { console.log('Found at:', p); break; }
  }
  console.log('syncService.js NOT FOUND in common paths');
  // Search
  const { execSync } = require('child_process');
  try {
    const result = execSync('dir /s /b syncService.js 2>nul', { encoding: 'utf8' });
    console.log('Search result:', result.trim());
  } catch(e) { console.log('Search failed'); }
  process.exit();
}
let c = fs.readFileSync(f, 'utf8');
console.log('File size:', c.length);

// Find collection() calls
const lines = c.split(/\r?\n/);
lines.forEach((line, i) => {
  if (line.includes('collection(')) {
    console.log(`Line ${i+1}: ${line.trim().substring(0, 120)}`);
  }
});
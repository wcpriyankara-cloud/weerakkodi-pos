const fs = require('fs');
const f = 'lib/localDb.js';
let c = fs.readFileSync(f, 'utf8');

// Remove the wrongly placed getBackupStats
c = c.replace(/\n\/\/ Backup stats helper[\s\S]*?return stats;\s*\};\s*\n/g, '\n');

// Find where db is defined (const db = new Dexie or similar)
const dbDefIdx = c.indexOf('const db =');
if (dbDefIdx === -1) {
  console.log('db definition NOT FOUND');
  // Try other patterns
  const alt = c.indexOf('db = new Dexie');
  if (alt !== -1) {
    console.log('Found at:', alt);
  }
  process.exit();
}

// Find the line after db.version().stores() block
// Look for the closing of the stores definition
const storesIdx = c.indexOf('.stores(', dbDefIdx);
if (storesIdx === -1) {
  console.log('.stores() NOT FOUND');
  process.exit();
}

// Find the closing }); of the stores block
let braceCount = 0;
let insertPos = storesIdx;
let found = false;
for (let i = storesIdx; i < c.length; i++) {
  if (c[i] === '{') braceCount++;
  if (c[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      // Find the ); after }
      const semiIdx = c.indexOf(');', i);
      if (semiIdx !== -1) {
        insertPos = semiIdx + 2;
        found = true;
        break;
      }
    }
  }
}

if (!found) {
  console.log('Could not find end of stores block');
  process.exit();
}

const statsFn = `

// Backup stats helper
db.getBackupStats = async function() {
  const stats = {};
  const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
  for (const t of tables) {
    try { stats[t] = await db[t].count(); } catch(e) { stats[t] = 0; }
  }
  stats._total = Object.values(stats).reduce((a, b) => a + b, 0);
  return stats;
};`;

c = c.substring(0, insertPos) + statsFn + c.substring(insertPos);
fs.writeFileSync(f, c, 'utf8');
console.log('OK - getBackupStats added after db definition!');
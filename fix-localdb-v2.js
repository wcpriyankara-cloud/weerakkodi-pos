const fs = require('fs');
const f = 'lib/localDb.js';
let lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);

// Step 1: Remove ALL getBackupStats lines
let cleaned = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('Backup stats helper') || line.includes('getBackupStats')) {
    skip = true;
    continue;
  }
  if (skip) {
    if (line.trim() === '};' || line.trim().endsWith('};')) {
      skip = false;
      continue;
    }
    continue;
  }
  cleaned.push(line);
}

console.log('Removed getBackupStats. Lines:', lines.length, '->', cleaned.length);

// Step 2: Find correct insert point (after db.stores block)
let insertIdx = -1;
for (let i = 0; i < cleaned.length; i++) {
  if (cleaned[i].includes('.stores(')) {
    // Find closing of this block
    for (let j = i; j < cleaned.length; j++) {
      if (cleaned[j].includes('});') || cleaned[j].trim() === '});') {
        insertIdx = j + 1;
        break;
      }
    }
    break;
  }
}

if (insertIdx === -1) {
  // Fallback: find 'const db' and insert after next 10 lines
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i].includes('const db =') || cleaned[i].includes('db = new Dexie')) {
      insertIdx = i + 1;
      // Find next empty line
      for (let j = i + 1; j < cleaned.length; j++) {
        if (cleaned[j].trim() === '') { insertIdx = j; break; }
      }
      break;
    }
  }
}

console.log('Insert at line:', insertIdx);

const statsBlock = [
  '',
  '// Backup stats helper',
  'db.getBackupStats = async function() {',
  '  const stats = {};',
  "  const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];",
  '  for (const t of tables) {',
  '    try { stats[t] = await db[t].count(); } catch(e) { stats[t] = 0; }',
  '  }',
  '  stats._total = Object.values(stats).reduce((a, b) => a + b, 0);',
  '  return stats;',
  '};'
];

if (insertIdx > 0) {
  cleaned.splice(insertIdx, 0, ...statsBlock);
} else {
  console.log('WARN: Could not find insert point, appending at end');
  cleaned.push(...statsBlock);
}

fs.writeFileSync(f, cleaned.join('\n'), 'utf8');
console.log('OK - Fixed!');

// Show context around insert
const start = Math.max(0, insertIdx - 3);
const end = Math.min(cleaned.length, insertIdx + 15);
console.log('\n--- Context ---');
for (let i = start; i < end; i++) {
  console.log(`${i+1}: ${cleaned[i]}`);
}
const fs = require('fs');

// Add getBackupStats to localDb.js
const f = 'lib/localDb.js';
if (!fs.existsSync(f)) {
  console.log('localDb.js NOT FOUND');
  process.exit();
}

let c = fs.readFileSync(f, 'utf8');

if (c.includes('getBackupStats')) {
  console.log('getBackupStats already exists. SKIP.');
  process.exit();
}

// Find the export line and add the function before it
const statsFn = `
// Backup stats helper
db.getBackupStats = async function() {
  const stats = {};
  const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
  for (const t of tables) {
    try { stats[t] = await db[t].count(); } catch(e) { stats[t] = 0; }
  }
  stats._total = Object.values(stats).reduce((a, b) => a + b, 0);
  stats._lastBackup = null;
  try {
    const inv = await db.invoices.orderBy('_savedAt').last();
    if (inv) stats._lastBackup = inv._savedAt;
  } catch(e) {}
  return stats;
};
`;

// Insert before the last export
const exportIdx = c.lastIndexOf('export');
if (exportIdx !== -1) {
  c = c.substring(0, exportIdx) + statsFn + '\n' + c.substring(exportIdx);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - getBackupStats added to localDb.js!');
} else {
  // Append at end
  c = c + '\n' + statsFn;
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - getBackupStats appended!');
}
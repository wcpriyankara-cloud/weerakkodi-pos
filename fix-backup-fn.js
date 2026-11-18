const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

if (c.includes('triggerLocalDiskBackup = useCallback')) {
  console.log('triggerLocalDiskBackup already defined. SKIP.');
  process.exit();
}

const backupFn = `
  /* ── Hard Disk Backup (Electron) ── */
  const triggerLocalDiskBackup = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.isElectron) return;
    try {
      const tables = ['invoices', 'customers', 'items', 'purchases', 'settings'];
      const backup = { _exportedAt: new Date().toISOString(), _version: 1 };
      for (const t of tables) {
        try { if (localDb[t]) backup[t] = await localDb[t].toArray(); } catch(e) {}
      }
      const result = await window.electronAPI.triggerBackup(backup);
      if (result?.success) {
        console.log('[Backup] Saved to disk:', result.path);
      } else {
        console.warn('[Backup] Failed:', result?.error);
      }
    } catch (e) {
      console.warn('[Backup] Error:', e);
    }
  }, []);
`;

// Insert before handleSaveInvoice
const marker = '/* ── Process and save invoice ── */';
if (c.includes(marker)) {
  c = c.replace(marker, backupFn + '\n  ' + marker);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - triggerLocalDiskBackup added!');
} else {
  const marker2 = 'const handleSaveInvoice = useCallback';
  if (c.includes(marker2)) {
    c = c.replace(marker2, backupFn + '\n  ' + marker2);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - triggerLocalDiskBackup added (alt position)!');
  } else {
    console.log('ERROR: Could not find insertion point');
  }
}
const fs = require('fs');
const path = require('path');

// Create a restore page
const restoreDir = path.join(__dirname, 'app', '(dashboard)', 'restore');
if (!fs.existsSync(restoreDir)) {
  fs.mkdirSync(restoreDir, { recursive: true });
}

const restorePage = `'use client';
import React, { useState } from 'react';
import { localDb } from '@/lib/localDb';
import { useUserAuth } from '@/context/UserContext';

export default function RestorePage() {
  const { user } = useUserAuth();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const restoreItems = async () => {
    if (!user?.uid) { setStatus('Login first!'); return; }
    setLoading(true);
    setStatus('Reading backup file...');
    try {
      const fs = window.require('fs');
      const backupPath = 'D:\\\\Weerakkodi_POS_Backups\\\\items_backup.json';
      
      if (!fs.existsSync(backupPath)) {
        setStatus('Backup file not found: ' + backupPath);
        setLoading(false);
        return;
      }
      
      const raw = fs.readFileSync(backupPath, 'utf8');
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : (data.items || data.data || []);
      
      setStatus('Found ' + items.length + ' items. Writing to Dexie...');
      
      // Ensure all items have the correct uid
      const uid = user.uid;
      const fixedItems = items.map(item => ({
        ...item,
        uid: uid,
        id: item.id || item.itemId || item.docId || crypto.randomUUID()
      }));
      
      // Write in batches of 500
      const batchSize = 500;
      let written = 0;
      for (let i = 0; i < fixedItems.length; i += batchSize) {
        const batch = fixedItems.slice(i, i + batchSize);
        await localDb.items.bulkPut(batch);
        written += batch.length;
        setStatus('Writing... ' + written + '/' + fixedItems.length);
      }
      
      setStatus('Done! Restored ' + written + ' items. Go to POS page now.');
    } catch (err) {
      setStatus('Error: ' + err.message);
      console.error(err);
    }
    setLoading(false);
  };

  const restoreFullSnapshot = async () => {
    if (!user?.uid) { setStatus('Login first!'); return; }
    setLoading(true);
    setStatus('Reading full snapshot...');
    try {
      const fs = window.require('fs');
      const dir = 'D:\\\\Weerakkodi_POS_Backups\\\\';
      const files = fs.readdirSync(dir).filter(f => f.startsWith('full_snapshot_wlknSmbTOEbc')).sort().reverse();
      
      if (files.length === 0) {
        setStatus('No full snapshot found');
        setLoading(false);
        return;
      }
      
      const latest = files[0];
      setStatus('Reading ' + latest + '...');
      const raw = fs.readFileSync(dir + latest, 'utf8');
      const data = JSON.parse(raw);
      const uid = user.uid;
      
      const collections = ['items', 'customers', 'invoices', 'purchases', 'suppliers'];
      let totalRestored = 0;
      
      for (const col of collections) {
        const records = data[col] || [];
        if (records.length === 0) continue;
        
        const fixed = records.map(r => ({ ...r, uid: uid, id: r.id || r.docId || crypto.randomUUID() }));
        const batchSize = 500;
        
        for (let i = 0; i < fixed.length; i += batchSize) {
          await localDb[col].bulkPut(fixed.slice(i, i + batchSize));
        }
        totalRestored += records.length;
        setStatus('Restored ' + col + ': ' + records.length + ' records');
      }
      
      setStatus('Done! Total restored: ' + totalRestored + ' records. Go to POS page.');
    } catch (err) {
      setStatus('Error: ' + err.message);
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: 'auto', color: 'white', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Data Restore Tool</h1>
      <p style={{ marginBottom: 20, color: '#94a3b8' }}>
        Backup එකෙන් data restore කරන්න. UID: {user?.uid || 'Not logged in'}
      </p>
      
      <button onClick={restoreItems} disabled={loading}
        style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', marginBottom: 12, width: '100%' }}>
        Restore Items Only (items_backup.json)
      </button>
      
      <button onClick={restoreFullSnapshot} disabled={loading}
        style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', marginBottom: 12, width: '100%' }}>
        Restore Full Snapshot (all data)
      </button>
      
      {status && (
        <div style={{ marginTop: 20, padding: 16, background: '#1e293b', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
          {status}
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(path.join(restoreDir, 'page.jsx'), restorePage, 'utf8');
console.log('OK - Restore page created at app/(dashboard)/restore/page.jsx');
console.log('\nAfter restart, go to: http://localhost:3000/restore');
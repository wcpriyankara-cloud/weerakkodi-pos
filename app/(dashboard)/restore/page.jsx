'use client';
import React, { useState } from 'react';
import { localDb } from '@/lib/localDb';

export default function RestorePage() {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatus('📂 ' + file.name + ' කියවමින්...');
    setProgress('');

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // 🔍 Debug: show actual structure
      const topKeys = Object.keys(data);
      console.log('RESTORE DEBUG: Top-level keys =', topKeys);
      console.log('RESTORE DEBUG: Type of each key:', topKeys.map(k => k + '=' + (Array.isArray(data[k]) ? 'array[' + data[k].length + ']' : typeof data[k])));

      // Try to find the real data object
      let actualData = data;

      // Check common wrapper patterns
      if (data.data && typeof data.data === 'object') {
        actualData = data.data;
        console.log('RESTORE DEBUG: Using data.data, keys =', Object.keys(actualData));
      }
      if (data.snapshot && typeof data.snapshot === 'object') {
        actualData = data.snapshot;
        console.log('RESTORE DEBUG: Using data.snapshot, keys =', Object.keys(actualData));
      }
      if (data.backup && typeof data.backup === 'object') {
        actualData = data.backup;
        console.log('RESTORE DEBUG: Using data.backup, keys =', Object.keys(actualData));
      }

      // Check if top-level IS an array (single table backup)
      if (Array.isArray(data)) {
        setStatus('⚠️ මේක array එකක් (' + data.length + ' items). Full snapshot file එකක් select කරන්න.');
        setLoading(false);
        return;
      }

      // Find all array properties in actualData
      const allKeys = Object.keys(actualData);
      const arrayKeys = allKeys.filter(k => Array.isArray(actualData[k]));
      console.log('RESTORE DEBUG: Array keys =', arrayKeys.map(k => k + '[' + actualData[k].length + ']'));

      if (arrayKeys.length === 0) {
        // Maybe one more level deep
        let deepData = null;
        for (const k of allKeys) {
          if (actualData[k] && typeof actualData[k] === 'object' && !Array.isArray(actualData[k])) {
            const subKeys = Object.keys(actualData[k]);
            const subArrays = subKeys.filter(sk => Array.isArray(actualData[k][sk]));
            if (subArrays.length > 0) {
              deepData = actualData[k];
              console.log('RESTORE DEBUG: Found arrays under key "' + k + '":', subArrays);
              break;
            }
          }
        }
        if (deepData) {
          actualData = deepData;
        } else {
          setStatus('⚠️ Structure: ' + topKeys.join(', ') + ' | Array keys: none. Console එකේ F12 → Console බලන්න.');
          setLoading(false);
          return;
        }
      }

      // Now restore
      let totalRestored = 0;
      const knownTables = ['customers', 'items', 'itemTransactions', 'purchases', 'suppliers', 'invoices', 'settings', 'products', 'stock', 'transactions'];

      // Match actual array keys to Dexie tables
      const finalArrayKeys = Object.keys(actualData).filter(k => Array.isArray(actualData[k]));

      for (const key of finalArrayKeys) {
        const rows = actualData[key];
        if (!rows || rows.length === 0) continue;

        // Find matching Dexie table
        let tableName = key;
        if (!localDb[key]) {
          // Try to match: e.g., "Products" → "items", "Stock" → "items"
          const match = knownTables.find(t => t.toLowerCase() === key.toLowerCase());
          if (match && localDb[match]) tableName = match;
          else if (!localDb[key]) {
            console.log('RESTORE DEBUG: No Dexie table for key "' + key + '", skipping');
            continue;
          }
        }

        setStatus('⏳ ' + tableName + ' restore කරමින්... (' + rows.length + ' records)');

        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          try {
            // 🔒 UID STAMP: Force current user UID on all records
            const { auth } = await import('@/lib/firebase');
            const currentUid = auth?.currentUser?.uid;
            const stampedBatch = currentUid ? batch.map(row => ({ ...row, uid: currentUid })) : batch;
            await localDb[tableName].bulkPut(stampedBatch);
            totalRestored += batch.length;
            setProgress('✅ ' + tableName + ': ' + Math.min(i + batchSize, rows.length) + '/' + rows.length);
          } catch (err) {
            console.error(tableName + ' batch error:', err);
          }
        }
      }

      if (totalRestored > 0) {
        setStatus('🎉 Restore සම්පූර්ණයි! ' + totalRestored + ' records restore වුණා.');
        setProgress('දැන් POS page එකට ගිහින් items බලන්න.');
      } else {
        setStatus('⚠️ කිසිම record එකක් restore වුණේ නැහැ. Keys: ' + finalArrayKeys.join(', '));
      }

    } catch (err) {
      setStatus('❌ Error: ' + err.message);
      console.error('Restore error:', err);
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>🔄 Data Restore</h1>
      <p>D:\Weerakkodi_POS_Backups\ ෆෝල්ඩර් එකෙන් <strong>full_snapshot</strong> file එක select කරන්න.</p>

      <div style={{ margin: '20px 0', padding: '20px', border: '2px dashed #666', borderRadius: '8px', textAlign: 'center' }}>
        <input
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          disabled={loading}
          style={{ fontSize: '16px' }}
        />
        <p style={{ color: '#888', marginTop: '10px' }}>
          💡 full_snapshot_wlknSmbTOEbc_2026-10-16T08-50-38-782Z.json (23 MB)
        </p>
      </div>

      {status && (
        <div style={{ padding: '15px', background: '#1a1a2e', color: '#0f0', borderRadius: '8px', marginTop: '20px', fontSize: '16px', whiteSpace: 'pre-wrap' }}>
          {status}
        </div>
      )}

      {progress && (
        <div style={{ padding: '10px', background: '#1a1a2e', color: '#ff0', borderRadius: '8px', marginTop: '10px' }}>
          {progress}
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <button
          onClick={() => window.location.href = '/pos'}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          ← POS Page එකට යන්න
        </button>
      </div>
    </div>
  );
}
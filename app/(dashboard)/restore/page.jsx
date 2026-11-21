'use client';

import React, { useState, useRef } from 'react';
import { localDb } from '@/lib/localDb';
import { auth } from '@/lib/firebase';

/* ══════════════════════════════════════════════════════════════
   KNOWN DEXIE TABLES & SYNONYMS MAPPING
   ══════════════════════════════════════════════════════════════ */
const TABLE_MAP = {
  products: 'items',
  stock: 'items',
  inventory: 'items',
  items: 'items',
  customers: 'customers',
  clients: 'customers',
  invoices: 'invoices',
  sales: 'invoices',
  bills: 'invoices',
  purchases: 'purchases',
  grn: 'purchases',
  suppliers: 'suppliers',
  vendors: 'suppliers',
  itemtransactions: 'itemTransactions',
  transactions: 'itemTransactions',
  settings: 'settings',
};

export default function RestorePage() {
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState([]);
  const fileInputRef = useRef(null);

  /* ══════════════════════════════════════════════════════════════
     RESTORE FILE PROCESSOR
     ══════════════════════════════════════════════════════════════ */
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus(`📂 File එක කියවමින්: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);
    setProgress('');
    setSummary([]);

    try {
      const text = await file.text();
      let rawData;
      
      try {
        rawData = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error('තෝරාගත් File එක සැබෑ JSON File එකක් නොවේ.');
      }

      console.log('RESTORE DEBUG: Raw JSON Keys =', Object.keys(rawData));

      // 1. Find actual snapshot object (handles wrapper keys like data, snapshot, backup)
      let actualData = rawData;
      if (rawData.data && typeof rawData.data === 'object' && !Array.isArray(rawData.data)) {
        actualData = rawData.data;
      } else if (rawData.snapshot && typeof rawData.snapshot === 'object' && !Array.isArray(rawData.snapshot)) {
        actualData = rawData.snapshot;
      } else if (rawData.backup && typeof rawData.backup === 'object' && !Array.isArray(rawData.backup)) {
        actualData = rawData.backup;
      }

      // Check if top-level IS an array (Single table backup)
      if (Array.isArray(rawData)) {
        setStatus(`⚠️ මෙම File එක Single Array එකකි (${rawData.length} items). කරුණාකර Full Snapshot Backup JSON File එකක් තෝරන්න.`);
        setLoading(false);
        return;
      }

      // 2. Locate all Array keys inside actualData
      let allKeys = Object.keys(actualData);
      let arrayKeys = allKeys.filter((k) => Array.isArray(actualData[k]));

      // Deep search if arrays are nested 1 level deeper
      if (arrayKeys.length === 0) {
        for (const k of allKeys) {
          if (actualData[k] && typeof actualData[k] === 'object' && !Array.isArray(actualData[k])) {
            const subKeys = Object.keys(actualData[k]);
            const subArrays = subKeys.filter((sk) => Array.isArray(actualData[k][sk]));
            if (subArrays.length > 0) {
              actualData = actualData[k];
              arrayKeys = subArrays;
              break;
            }
          }
        }
      }

      if (arrayKeys.length === 0) {
        setStatus(`⚠️ Backup File එක තුළ කිසිදු දත්ත සටහනක් (Arrays) සොයාගත නොහැක. (Top Keys: ${allKeys.join(', ')})`);
        setLoading(false);
        return;
      }

      // 3. User UID for data stamping
      const currentUid = auth?.currentUser?.uid || null;

      // 4. Batch Restore Execution
      let totalRestoredCount = 0;
      const restoredSummaryList = [];
      const CHUNK_SIZE = 500; // Optimal batch size for IndexedDB

      for (const key of arrayKeys) {
        const rows = actualData[key];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        // Map key to local Dexie table name
        const lowerKey = key.toLowerCase();
        const targetTableName = TABLE_MAP[lowerKey] || key;
        const dexieTable = localDb[targetTableName];

        if (!dexieTable) {
          console.warn(`[Restore] Dexie table "${targetTableName}" missing for array key "${key}". Skipping.`);
          continue;
        }

        setStatus(`⏳ ${targetTableName.toUpperCase()} Table එකට Data Restore වෙමින්... (${rows.length} records)`);

        let tableSuccessCount = 0;

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);

          // 🔒 Primary Key & UID Guarantee
          const sanitizedBatch = chunk.map((row, idx) => {
            const rowObj = typeof row === 'object' && row !== null ? row : { value: row };
            
            // Guarantee Primary Key 'id'
            const id = String(
              rowObj.id || rowObj.docId || rowObj.itemId || rowObj.invoiceId || `${targetTableName}_${Date.now()}_${i + idx}`
            );

            return {
              ...rowObj,
              id,
              docId: id,
              ...(currentUid ? { uid: currentUid } : {}),
              synced: rowObj.synced ?? 1,
              _synced: rowObj._synced ?? true,
              _localSaved: false,
            };
          });

          try {
            await dexieTable.bulkPut(sanitizedBatch);
            tableSuccessCount += sanitizedBatch.length;
            totalRestoredCount += sanitizedBatch.length;

            const progressPct = Math.round((Math.min(i + CHUNK_SIZE, rows.length) / rows.length) * 100);
            setProgress(`⚡ ${targetTableName}: ${Math.min(i + CHUNK_SIZE, rows.length)} / ${rows.length} [${progressPct}%]`);

            // Event-loop yield to prevent browser freeze
            await new Promise((res) => setTimeout(res, 10));
          } catch (batchErr) {
            console.error(`[Restore Error] Table ${targetTableName} Batch failed:`, batchErr);
          }
        }

        if (tableSuccessCount > 0) {
          restoredSummaryList.push(`✅ ${targetTableName}: ${tableSuccessCount} records`);
        }
      }

      // 5. Final Report
      if (totalRestoredCount > 0) {
        setStatus(`🎉 Restore ක්‍රියාවලිය සාර්ථකයි! මුළු Records ${totalRestoredCount}ක් PC Local Database එකට එක් කරන ලදී.`);
        setProgress('දැන් POS පිටුව වෙත ගොස් පරීක්ෂා කරන්න.');
        setSummary(restoredSummaryList);
      } else {
        setStatus(`⚠️ කිසිදු Record එකක් Restore කිරීමට නොහැකි විය. Check Console (F12).`);
      }
    } catch (err) {
      console.error('[Restore Critical Error]:', err);
      setStatus(`❌ Restore දෝෂයක්: ${err?.message || err}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ padding: '30px 20px', maxWidth: '750px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
        <h1 style={{ margin: '0 0 10px', fontSize: '24px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🔄 Local Data Restore Manager
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5', marginBottom: '20px' }}>
          ඔබගේ PC Hard Disk එකෙහි <code>D:\Weerakkodi_POS_Backups\</code> ෆෝල්ඩරයේ ඇති <strong>full_snapshot_...json</strong> Backup File එක තෝරා ඉතා ඉක්මනින් Local Database එකට Data Load කරගන්න.
        </p>

        {/* File Picker Box */}
        <div
          style={{
            margin: '20px 0',
            padding: '30px 20px',
            border: '2px dashed #3b82f6',
            borderRadius: '12px',
            textAlign: 'center',
            backgroundColor: '#eff6ff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            disabled={loading}
            style={{ fontSize: '15px', cursor: 'pointer' }}
          />
          <p style={{ color: '#3b82f6', marginTop: '12px', fontSize: '13px', fontWeight: 'bold' }}>
            💡 උදාහරණ File: <code>full_snapshot_wlknSmbTOEbc_2026-10-16.json</code>
          </p>
        </div>

        {/* Status Message Display */}
        {status && (
          <div
            style={{
              padding: '16px',
              background: '#0f172a',
              color: '#38bdf8',
              borderRadius: '10px',
              marginTop: '20px',
              fontSize: '14px',
              fontWeight: '600',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
            }}
          >
            {status}
          </div>
        )}

        {/* Live Progress Bar */}
        {progress && (
          <div
            style={{
              padding: '12px 16px',
              background: '#1e293b',
              color: '#facc15',
              borderRadius: '8px',
              marginTop: '10px',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            {progress}
          </div>
        )}

        {/* Summary Breakdown */}
        {summary.length > 0 && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
            <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '15px' }}>📊 Restore වූ දත්ත සාරාංශය:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#15803d', fontSize: '14px', lineHeight: '1.8' }}>
              {summary.map((line, idx) => (
                <li key={idx}><strong>{line}</strong></li>
              ))}
            </ul>
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ marginTop: '30px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => (window.location.href = '/pos')}
            style={{
              padding: '12px 24px',
              fontSize: '15px',
              fontWeight: 'bold',
              cursor: 'pointer',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
            }}
          >
            ← POS Terminal පිටුවට යන්න
          </button>
        </div>
      </div>
    </div>
  );
}
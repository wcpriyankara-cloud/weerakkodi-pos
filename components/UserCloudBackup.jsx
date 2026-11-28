'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import localDb, {
  ensureDbOpen,
  setupBackupDirectory,
  manualBackupToDisk,
  listBackupFiles,
  readBackupFile,
  restoreFromBackup,
  getBackupDirHandle,
} from '@/lib/localDb';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function UserCloudBackup({ user: propUser }) {
  const [user, setUser] = useState(propUser || null);
  const [stats, setStats] = useState({ invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, customerLoans: 0, _total: 0 });
  const [firebaseCounts, setFirebaseCounts] = useState(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [backupPath, setBackupPath] = useState('Not selected');
  const [backupFiles, setBackupFiles] = useState([]);
  const [showFileList, setShowFileList] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pulling, setPulling] = useState(false);

  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const cleanUid = String(user?.uid || '').trim();

  /* ── Auth State Listener ── */
  useEffect(() => {
    isMountedRef.current = true;
    if (propUser) {
      setUser(propUser);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      if (isMountedRef.current) setUser(u);
    });
    return () => {
      isMountedRef.current = false;
      unsub();
    };
  }, [propUser]);

  /* ── Load Saved Backup Path ── */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('pos_backup_path');
        if (saved) setBackupPath(saved);
      } catch (e) {}
    }
  }, []);

  /* ── 1. Load Local PC Hard Disk Stats (STRICT USER ISOLATION) ── */
  const loadStats = useCallback(async () => {
    if (!cleanUid) {
      if (isMountedRef.current) {
        setStats({ invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, customerLoans: 0, _total: 0 });
      }
      return;
    }

    try {
      const database = await ensureDbOpen();
      const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'customerLoans'];
      const s = { invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, customerLoans: 0, _total: 0 };

      for (const t of tables) {
        try {
          if (database && database[t]) {
            const allRecords = await database[t].toArray();
            s[t] = allRecords.filter(r => r && String(r.uid || r.userId || '').trim() === cleanUid).length;
          } else {
            s[t] = 0;
          }
        } catch (tableErr) {
          s[t] = 0;
        }
      }

      s._total = s.invoices + s.customers + s.items + s.purchases + s.suppliers + s.customerLoans;
      if (isMountedRef.current) {
        setStats(s);
      }
    } catch (e) {}
  }, [cleanUid]);

  /* ── 2. Load Real-time Cloud Counts (STRICT FIRESTORE FILTER) ── */
  const loadFirebaseCounts = useCallback(async () => {
    if (!cleanUid) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    if (isMountedRef.current) setLoadingCloud(true);

    try {
      const counts = { invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, customerLoans: 0, _total: 0 };
      const collections = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'customerLoans'];

      for (const col of collections) {
        try {
          const q = query(collection(db, col), where('uid', '==', cleanUid));
          const snap = await getDocs(q);
          counts[col] = snap.size;
        } catch (e) {
          if (e?.code === 'resource-exhausted') break;
        }
      }

      counts._total = counts.invoices + counts.customers + counts.items + counts.purchases + counts.suppliers + counts.customerLoans;
      if (isMountedRef.current) {
        setFirebaseCounts(counts);
      }
    } catch (e) {
    } finally {
      if (isMountedRef.current) setLoadingCloud(false);
    }
  }, [cleanUid]);

  useEffect(() => {
    loadStats();
    loadFirebaseCounts();
  }, [loadStats, loadFirebaseCounts]);

  /* ── 3. DIRECT CLOUD -> PC HARD DISC PULL (STRICT ACTIVE USER) ── */
  const handlePullCloudToPc = async () => {
    if (!cleanUid) {
      alert('කරුණාකර පළමුව Login වන්න.');
      return;
    }
    if (!window.navigator.onLine) {
      alert('⚠️ ඔබ Offline වේ. Cloud දත්ත බාගත කිරීමට අන්තර්ජාලය අවශ්‍ය වේ.');
      return;
    }

    setPulling(true);
    setStatus('exporting');
    setStatusMessage('📥 Cloud (Firebase) වෙතින් PC Hard Disk එකට දත්ත බාගත වෙමින් පවතී...');

    try {
      const database = await ensureDbOpen();
      const collections = [
        { col: 'items', table: database.items, map: (id, d) => ({ id, docId: id, ...d, currentStock: d.currentStock ?? d.stock ?? 0 }) },
        { col: 'customers', table: database.customers },
        { col: 'customerLoans', table: database.customerLoans },
        { col: 'invoices', table: database.invoices },
        { col: 'purchases', table: database.purchases },
        { col: 'suppliers', table: database.suppliers },
      ];

      let downloadedTotal = 0;

      for (const target of collections) {
        if (!target.table) continue;
        try {
          const q = query(collection(db, target.col), where('uid', '==', cleanUid));
          const snap = await getDocs(q);

          const docsToPut = [];
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const mapped = target.map ? target.map(docSnap.id, data) : { id: docSnap.id, ...data };
            docsToPut.push({
              ...mapped,
              id: String(mapped.id || docSnap.id),
              docId: String(mapped.docId || docSnap.id),
              uid: cleanUid,
              synced: 1,
              _synced: true,
              _localSaved: false,
            });
          });

          if (docsToPut.length > 0) {
            await target.table.bulkPut(docsToPut);
            downloadedTotal += docsToPut.length;
          }
        } catch (colErr) {
          console.warn(`[PullCloud] Error fetching ${target.col}:`, colErr);
        }
      }

      await loadStats();
      await loadFirebaseCounts();
      setStatus('success');
      setStatusMessage(`✅ බාගත කිරීම සාර්ථකයි! Records ${downloadedTotal}ක් PC Hard Disk එකට Save විය.`);
      alert(`🎉 සාර්ථකයි!\n\n☁️ Cloud වෙතින් PC Hard Disk එකට Records ${downloadedTotal}ක් බාගත කර Save කරන ලදී.`);
    } catch (e) {
      setStatus('error');
      setStatusMessage('❌ Download දෝෂයක්: ' + (e?.message || e));
    } finally {
      if (isMountedRef.current) setPulling(false);
    }
  };

  /* ── Select Backup Folder ── */
  const handleSelectBackupPath = async () => {
    try {
      if (isElectron && window.electronAPI?.selectBackupFolder) {
        const result = await window.electronAPI.selectBackupFolder();
        const selectedPath = typeof result === 'string' ? result : result?.path || '';
        if (selectedPath) {
          setBackupPath(selectedPath);
          localStorage.setItem('pos_backup_path', selectedPath);
          setStatus('success');
          setStatusMessage('✅ Backup folder: ' + selectedPath);
          loadStats();
        }
        return;
      }

      if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
        const success = await setupBackupDirectory();
        if (success) {
          const handle = await getBackupDirHandle();
          const pathDisplay = '📁 ' + (handle?.name || 'Selected Folder');
          setBackupPath(pathDisplay);
          localStorage.setItem('pos_backup_path', pathDisplay);
          setStatus('success');
          setStatusMessage('✅ Backup folder තෝරා ගන්නා ලදී.');
        }
      }
    } catch (err) {
      setStatus('error');
      setStatusMessage('❌ Folder selection error: ' + (err?.message || err));
    }
  };

  /* ── Manual Export ── */
  const handleExport = async () => {
    if (!cleanUid) {
      alert('කරුණාකර පළමුව Login වන්න.');
      return;
    }

    setStatus('exporting');
    setStatusMessage('📦 Backup file generate කරමින්...');
    try {
      const fileName = await manualBackupToDisk(cleanUid, 'manual');
      if (fileName) {
        setStatus('success');
        setStatusMessage(`✅ Backup saved: ${fileName}`);
        await loadStats();
      } else {
        setStatus('error');
        setStatusMessage('❌ Export failed');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage('❌ Export failed: ' + (error?.message || error));
    }
  };

  /* ── View Saved Backup Files ── */
  const loadBackupFiles = useCallback(async () => {
    if (!cleanUid) return;
    try {
      const files = await listBackupFiles();
      const shortUid = cleanUid.slice(0, 8);
      const userFiles = Array.isArray(files) 
        ? files.filter(f => {
            const name = f?.name || String(f);
            return name.includes(shortUid) || name.startsWith(`backup_${shortUid}`);
          })
        : [];
      setBackupFiles(userFiles);
      setShowFileList(true);
    } catch (e) {
      setBackupFiles([]);
      setShowFileList(true);
    }
  }, [cleanUid]);

  /* ── Restore File Handler ── */
  const handleRestore = async (fileName) => {
    if (!cleanUid) return;
    if (!window.confirm(`⚠️ "${fileName}" restore කරන්නද? local data overwrite වේ!`)) return;
    setRestoring(true);
    try {
      const backupData = await readBackupFile(fileName);
      if (backupData && typeof backupData === 'object') {
        for (const tbl of Object.keys(backupData)) {
          if (Array.isArray(backupData[tbl])) {
            backupData[tbl] = backupData[tbl].map(rec => ({ ...rec, uid: cleanUid }));
          }
        }
      }

      if (await restoreFromBackup(backupData)) {
        alert('✅ Restore සාර්ථකයි!');
        window.location.reload();
      }
    } catch (e) {
      alert('❌ Restore error: ' + (e?.message || e));
    } finally {
      if (isMountedRef.current) setRestoring(false);
    }
  };

  /* ── Restore Directly from Custom Local File Input ── */
  const handleDirectFileRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !cleanUid) return;

    if (!window.confirm(`⚠️ "${file.name}" Backup file එකෙන් Data Restore කරන්නද?`)) return;

    setRestoring(true);
    setStatusMessage('📂 File කියවමින්...');

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (backupData && typeof backupData === 'object') {
        for (const tbl of Object.keys(backupData)) {
          if (Array.isArray(backupData[tbl])) {
            backupData[tbl] = backupData[tbl].map(rec => ({ ...rec, uid: cleanUid }));
          }
        }
      }

      if (await restoreFromBackup(backupData)) {
        alert('🎉 Direct Restore සාර්ථකයි!');
        window.location.reload();
      } else {
        alert('⚠️ Restore කිරීමට නොහැකි විය. File structure එක පරීක්ෂා කරන්න.');
      }
    } catch (err) {
      alert('❌ File Restore error: ' + (err?.message || err));
    } finally {
      if (isMountedRef.current) setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', borderRadius: '16px', padding: '24px', color: '#ffffff', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleDirectFileRestore}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>☁️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Cloud & PC Hard Disc Backup Comparison</h2>
            <div style={{ fontSize: '11px', color: '#93c5fd', marginTop: '2px' }}>
              👤 User: <strong>{user?.email || cleanUid.slice(0, 8)}</strong> (Strict Isolation Active)
            </div>
          </div>
        </div>
        <button
          onClick={() => { loadStats(); loadFirebaseCounts(); }}
          style={{ padding: '6px 14px', background: '#38bdf8', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          🔄 Refresh Counts
        </button>
      </div>

      {/* Dual Comparison Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        
        {/* Card 1: PC Hard Disc (Local) */}
        <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: '700', color: '#38bdf8', fontSize: '14px' }}>💻 PC Hard Disc (Local)</span>
            <strong style={{ fontSize: '16px', color: '#38bdf8' }}>{stats._total} Records</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📄 Invoices:</span><strong>{stats.invoices}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>👥 Customers:</span><strong>{stats.customers}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📦 Items:</span><strong>{stats.items}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🛒 Purchases:</span><strong>{stats.purchases}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🏭 Suppliers:</span><strong>{stats.suppliers}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>💰 Customer Loans:</span><strong>{stats.customerLoans}</strong></div>
          </div>
        </div>

        {/* Card 2: Cloud (Firebase) */}
        <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: '700', color: '#22c55e', fontSize: '14px' }}>☁️ Cloud (Firebase)</span>
            <strong style={{ fontSize: '16px', color: '#22c55e' }}>{loadingCloud ? '⏳ Loading...' : `${firebaseCounts?._total || 0} Records`}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📄 Invoices:</span><strong>{firebaseCounts?.invoices || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>👥 Customers:</span><strong>{firebaseCounts?.customers || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📦 Items:</span><strong>{firebaseCounts?.items || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🛒 Purchases:</span><strong>{firebaseCounts?.purchases || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🏭 Suppliers:</span><strong>{firebaseCounts?.suppliers || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>💰 Customer Loans:</span><strong>{firebaseCounts?.customerLoans || 0}</strong></div>
          </div>
        </div>

      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        
        {/* DIRECT CLOUD DOWNLOAD BUTTON */}
        <button
          onClick={handlePullCloudToPc}
          disabled={pulling}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#0284c7', color: 'white', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          {pulling ? '⏳ බාගත වෙමින්...' : '☁️ ➔ 💻 Pull Cloud Data to PC'}
        </button>

        <button
          onClick={handleExport}
          disabled={status === 'exporting'}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#10b981', color: 'white', fontWeight: '700', cursor: 'pointer' }}
        >
          📥 Download PC Local Backup (.JSON)
        </button>

        <button
          onClick={loadBackupFiles}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#6366f1', color: 'white', fontWeight: '700', cursor: 'pointer' }}
        >
          📋 View Saved Backup Files
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={restoring}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#f97316', color: 'white', fontWeight: '700', cursor: 'pointer' }}
        >
          📂 Browse & Restore JSON File
        </button>
      </div>

      {/* Target Backup Folder Path */}
      <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fbbf24' }}>🏠 Target Backup Folder</div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px', wordBreak: 'break-all' }}>{backupPath}</div>
          </div>
          <button
            onClick={handleSelectBackupPath}
            style={{ padding: '8px 14px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            📂 CHANGE FOLDER
          </button>
        </div>
      </div>

      {/* Backup Files Modal / List */}
      {showFileList && (
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#38bdf8' }}>📁 Saved Backup Files ({backupFiles.length})</h3>
            <button onClick={() => setShowFileList(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer' }}>✕</button>
          </div>
          {backupFiles.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>
              ඔබගේ ගිණුමට අදාළ Backup File එකක් සොයාගත නොහැක.
            </div>
          ) : (
            backupFiles.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', marginBottom: '6px', borderRadius: '6px', fontSize: '12px' }}>
                <span style={{ wordBreak: 'break-all' }}>📄 {file.name}</span>
                <button
                  onClick={() => handleRestore(file.name)}
                  disabled={restoring}
                  style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {restoring ? '⏳' : 'Restore'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Status Alert Message */}
      {statusMessage && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: status === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', border: `1px solid ${status === 'error' ? '#ef4444' : '#10b981'}`, borderRadius: '8px', fontSize: '12px' }}>
          {statusMessage}
        </div>
      )}

    </div>
  );
}
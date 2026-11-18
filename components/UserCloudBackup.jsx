'use client';

import { useState, useEffect, useCallback } from 'react';
import localDb, {
  setupBackupDirectory,
  manualBackupToDisk,
  autoBackupToDisk,
  listBackupFiles,
  readBackupFile,
  restoreFromBackup,
  getBackupDirHandle,
} from '@/lib/localDb';
import { useUserAuth } from '@/context/UserContext';
import { db } from '@/shared/firebase-config';
import { collection, query, where, getDocs } from 'firebase/firestore';

const INVOICE_COLLECTIONS = ['customerTransactions', 'invoices', 'drafts'];

export default function UserCloudBackup() {
  const authContext = useUserAuth ? useUserAuth() : null;
  const user = authContext?.user || null;
  const userId = user?.uid || 'local_user';

  const [stats, setStats] = useState({ invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, _total: 0 });
  const [firebaseCounts, setFirebaseCounts] = useState(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [backupPath, setBackupPath] = useState('Not selected');
  const [backupFiles, setBackupFiles] = useState([]);
  const [showFileList, setShowFileList] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('pos_backup_path');
        if (saved) setBackupPath(saved);
        const autoEnabled = localStorage.getItem('pos_auto_backup');
        if (autoEnabled === 'true') setAutoBackupEnabled(true);
      } catch (e) {}
    }
  }, []);

  // 1. Load Local PC Hard Disc Stats (Filtered by Current User UID)
  const loadStats = useCallback(async () => {
    try {
      const uid = user?.uid;
      const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers'];
      const s = { invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, _total: 0 };
      
      for (const t of tables) {
        try {
          if (localDb && localDb[t]) {
            if (uid) {
              s[t] = await localDb[t].filter(item => item.uid === uid || item.userId === uid).count();
            } else {
              s[t] = await localDb[t].count();
            }
          } else {
            s[t] = 0;
          }
        } catch {
          s[t] = 0;
        }
      }
      s._total = Object.values(s).reduce((a, b) => a + b, 0);
      setStats(s);
    } catch (e) {}
  }, [user]);

  // 2. Fetch Real-time Cloud Counts Filtered by Current User UID (Firebase Firestore)
  const loadFirebaseCounts = useCallback(async () => {
    if (!user?.uid) return;
    setLoadingCloud(true);
    try {
      const counts = { invoices: 0, customers: 0, items: 0, purchases: 0, suppliers: 0, _total: 0 };

      // Invoices & Drafts for Logged-in User
      for (const col of INVOICE_COLLECTIONS) {
        try {
          const q = query(collection(db, col), where('uid', '==', user.uid));
          const snap = await getDocs(q);
          counts.invoices += snap.size;
        } catch (e) {}
      }

      // Customers for Logged-in User
      try {
        const cq = query(collection(db, 'customers'), where('uid', '==', user.uid));
        const csnap = await getDocs(cq);
        counts.customers = csnap.size;
      } catch (e) {}

      // Items for Logged-in User
      try {
        const iq = query(collection(db, 'items'), where('uid', '==', user.uid));
        const isnap = await getDocs(iq);
        counts.items = isnap.size;
      } catch (e) {}

      // Purchases for Logged-in User
      try {
        const pq = query(collection(db, 'purchases'), where('uid', '==', user.uid));
        const psnap = await getDocs(pq);
        counts.purchases = psnap.size;
      } catch (e) {}

      // Suppliers for Logged-in User
      try {
        const sq = query(collection(db, 'suppliers'), where('uid', '==', user.uid));
        const ssnap = await getDocs(sq);
        counts.suppliers = ssnap.size;
      } catch (e) {}

      counts._total = counts.invoices + counts.customers + counts.items + counts.purchases + counts.suppliers;
      setFirebaseCounts(counts);
    } catch (e) {
      console.error('Firebase count error:', e);
    } finally {
      setLoadingCloud(false);
    }
  }, [user]);

  useEffect(() => {
    loadStats();
    loadFirebaseCounts();
  }, [loadStats, loadFirebaseCounts]);

  const handleSelectBackupPath = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.selectBackupFolder) {
        const result = await window.electronAPI.selectBackupFolder();
        const selectedPath = typeof result === 'string' ? result : (result?.path || '');
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
      setStatusMessage('❌ Folder selection error: ' + err.message);
    }
  };

  const handleExport = async () => {
    setStatus('exporting');
    setStatusMessage('📦 Backup file generate කරමින්...');
    try {
      const fileName = await manualBackupToDisk(userId, 'manual');
      if (fileName) {
        setStatus('success');
        setStatusMessage(`✅ Backup saved: ${fileName}`);
        loadStats();
        loadFirebaseCounts();
      } else {
        setStatus('error');
        setStatusMessage('❌ Export failed');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage('❌ Export failed: ' + error.message);
    }
  };

  const loadBackupFiles = useCallback(async () => {
    try {
      const files = await listBackupFiles();
      setBackupFiles(Array.isArray(files) ? files : []);
      setShowFileList(true);
    } catch (e) {
      setBackupFiles([]);
      setShowFileList(true);
    }
  }, []);

  const handleRestore = async (fileName) => {
    if (!window.confirm(`⚠️ "${fileName}" restore කරන්නද? local data overwrite වේ!`)) return;
    setRestoring(true);
    try {
      const backupData = await readBackupFile(fileName);
      if (await restoreFromBackup(backupData)) {
        alert('✅ Restore සාර්ථකයි!');
        window.location.reload();
      }
    } catch (e) {
      alert('❌ Restore error: ' + e.message);
    } finally {
      setRestoring(false);
    }
  };

  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  return (
    <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', borderRadius: '16px', padding: '24px', color: '#ffffff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>☁️</span>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Cloud & PC Hard Disc Backup Comparison</h2>
        </div>
        <button
          onClick={() => { loadStats(); loadFirebaseCounts(); }}
          style={{ padding: '6px 12px', background: '#38bdf8', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          🔄 Refresh Counts
        </button>
      </div>

      {/* ══ Side-by-Side Dual Comparison Cards ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        
        {/* Card 1: PC Hard Disc (Local) */}
        <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: '700', color: '#38bdf8', fontSize: '14px' }}>💻 PC Hard Disc (Local)</span>
            <strong style={{ fontSize: '16px' }}>{stats._total} Records</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📄 Invoices:</span><strong>{stats.invoices}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>👥 Customers:</span><strong>{stats.customers}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📦 Items:</span><strong>{stats.items}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🛒 Purchases:</span><strong>{stats.purchases}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🏭 Suppliers:</span><strong>{stats.suppliers}</strong></div>
          </div>
        </div>

        {/* Card 2: Cloud (Firebase) */}
        <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: '700', color: '#22c55e', fontSize: '14px' }}>☁️ Cloud (Firebase)</span>
            <strong style={{ fontSize: '16px' }}>{loadingCloud ? '⏳ Loading...' : `${firebaseCounts?._total || 0} Records`}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📄 Invoices:</span><strong>{firebaseCounts?.invoices || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>👥 Customers:</span><strong>{firebaseCounts?.customers || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>📦 Items:</span><strong>{firebaseCounts?.items || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🛒 Purchases:</span><strong>{firebaseCounts?.purchases || 0}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🏭 Suppliers:</span><strong>{firebaseCounts?.suppliers || 0}</strong></div>
          </div>
        </div>

      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <button
          onClick={handleExport}
          disabled={status === 'exporting'}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#10b981', color: 'white', fontWeight: '700', cursor: 'pointer' }}
        >
          📥 Download PC Local Backup
        </button>
        <button
          onClick={loadBackupFiles}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#6366f1', color: 'white', fontWeight: '700', cursor: 'pointer' }}
        >
          📋 View Saved Backup Files
        </button>
      </div>

      {/* Backup Path Selection */}
      <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fbbf24' }}>🏠 Target Backup Folder</div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>{backupPath}</div>
          </div>
          <button
            onClick={handleSelectBackupPath}
            style={{ padding: '8px 14px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            📂 CHANGE FOLDER
          </button>
        </div>
      </div>

      {/* Backup Files List Modal / View */}
      {showFileList && (
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px' }}>📁 Backup Files ({backupFiles.length})</h3>
            <button onClick={() => setShowFileList(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
          {backupFiles.map((file, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'rgba(255,255,255,0.05)', marginBottom: '4px', borderRadius: '6px', fontSize: '12px' }}>
              <span>📄 {file.name}</span>
              <button onClick={() => handleRestore(file.name)} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Restore</button>
            </div>
          ))}
        </div>
      )}

      {statusMessage && (
        <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '8px', fontSize: '12px' }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
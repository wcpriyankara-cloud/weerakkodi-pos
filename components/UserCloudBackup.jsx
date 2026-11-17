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

// ★ Firebase imports for real-time invoice count
import { db } from '@/shared/firebase-config';
import { collection, query, where, getDocs } from 'firebase/firestore';

const INVOICE_COLLECTIONS = ['invoices', 'drafts', 'invoiceDrafts'];

export default function UserCloudBackup() {
  const authContext = useUserAuth ? useUserAuth() : null;
  const user = authContext?.user || null;
  const userId = user?.uid || 'local_user';

  const [stats, setStats] = useState(null);
  const [firebaseCounts, setFirebaseCounts] = useState(null);
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [backupPath, setBackupPath] = useState('Not selected');
  const [backupFiles, setBackupFiles] = useState([]);
  const [showFileList, setShowFileList] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Load saved path and stats on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('pos_backup_path');
        if (saved) setBackupPath(saved);
        const autoEnabled = localStorage.getItem('pos_auto_backup');
        if (autoEnabled === 'true') setAutoBackupEnabled(true);
      } catch (e) {
        console.error('Storage error:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (userId) {
      loadStats();
      loadFirebaseCounts();
    }
  }, [userId]);

      const loadStats = async () => {
    try {
      // Count directly from Dexie tables — no dependency on attached methods
      const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
      const s = {};
      for (const t of tables) {
        try { s[t] = localDb && localDb[t] ? await localDb[t].count() : 0; } catch { s[t] = 0; }
      }
      s._total = Object.values(s).reduce((a, b) => a + b, 0);
      setStats(s);
    } catch (e) {
      console.warn('[Backup] loadStats skipped:', e.message);
    }
  };

  // ★ Fetch real counts from Firebase (not local cache)
  const loadFirebaseCounts = async () => {
    if (!user?.uid || user.uid === 'offline_user' || user.uid === 'local_user') return;
    try {
      const counts = { invoices: 0, customers: 0, items: 0 };
      
      // Count invoices from all collections
      for (const col of INVOICE_COLLECTIONS) {
        try {
          const q = query(collection(db, col), where('uid', '==', user.uid));
          const snap = await getDocs(q);
          counts.invoices += snap.size;
        } catch (e) {
          console.warn(`[Backup] Failed to count ${col}:`, e.message);
        }
      }

      // Count customers
      try {
        const cq = query(collection(db, 'customers'), where('uid', '==', user.uid));
        const csnap = await getDocs(cq);
        counts.customers = csnap.size;
      } catch {}

      // Count items
      try {
        const iq = query(collection(db, 'items'), where('uid', '==', user.uid));
        const isnap = await getDocs(iq);
        counts.items = isnap.size;
      } catch {}

      setFirebaseCounts(counts);
      console.log('📊 [Backup] Firebase counts:', counts);
    } catch (e) {
      console.error('[Backup] Firebase count error:', e);
    }
  };

  // ── Select Backup Folder ──
  const handleSelectBackupPath = async () => {
    console.log('🔍 [Backup Path] Button clicked');

    try {
      // ✅ Strategy 1: Electron — native OS folder dialog
      if (typeof window !== 'undefined' && window.electronAPI?.selectBackupFolder) {
        console.log('📂 [Backup Path] Using Electron native dialog');
        const result = await window.electronAPI.selectBackupFolder();
        const selectedPath = typeof result === 'string'
          ? result
          : (result?.path || '');

        if (selectedPath) {
          setBackupPath(selectedPath);
          localStorage.setItem('pos_backup_path', selectedPath);
          localStorage.setItem('weerakkodi_backup_path', selectedPath);
          setStatus('success');
          setStatusMessage('✅ Backup folder: ' + selectedPath);
          setTimeout(() => { setStatus('idle'); setStatusMessage(''); }, 4000);
          loadStats();
          loadBackupFiles();
        } else {
          console.log('⚠️ [Backup Path] User canceled or no path returned');
        }
        return;
      }

      // ✅ Strategy 2: Browser (Chrome/Edge) — File System Access API
      if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
        console.log('📂 [Backup Path] Using Browser showDirectoryPicker');
        const success = await setupBackupDirectory();
        if (success) {
          const handle = await getBackupDirHandle();
          const folderName = handle?.name || 'Selected Folder';
          const pathDisplay = '📁 ' + folderName;
          setBackupPath(pathDisplay);
          localStorage.setItem('pos_backup_path', pathDisplay);
          setStatus('success');
          setStatusMessage('✅ Backup folder තෝරා ගන්නා ලදී: ' + folderName);
          setTimeout(() => { setStatus('idle'); setStatusMessage(''); }, 4000);
          loadStats();
          loadBackupFiles();
        }
        return;
      }

      // ❌ Strategy 3: No support
      console.warn('⚠️ [Backup Path] No folder picker available');
      setStatus('error');
      setStatusMessage('⚠️ ඔබගේ browser එක folder selection support කරන්නේ නැහැ. Chrome/Edge use කරන්න.');
    } catch (err) {
      console.error('❌ [Backup Path] Error:', err);
      setStatus('error');
      setStatusMessage('❌ Folder selection error: ' + (err?.message || 'Unknown'));
    }
  };

  // ── Export / Download Backup (★ Now fetches ALL from Firebase) ──
  const handleExport = async () => {
    setStatus('exporting');
    setStatusMessage('📦 Firebase එකෙන් සියලුම data ලබා ගනිමින්...');
    try {
      // ★ Step 1: Fetch ALL invoices from Firebase (not just local cache)
      let allInvoices = [];
      if (user?.uid && user.uid !== 'offline_user' && user.uid !== 'local_user') {
        setStatusMessage('📦 Fetching invoices from cloud...');
        for (const col of INVOICE_COLLECTIONS) {
          try {
            const q = query(collection(db, col), where('uid', '==', user.uid));
            const snap = await getDocs(q);
            snap.forEach((doc) => {
              allInvoices.push({ id: doc.id, _col: col, ...doc.data() });
            });
          } catch (e) {
            console.warn(`[Backup] Failed to fetch ${col}:`, e.message);
          }
        }
        console.log(`📦 [Backup] Fetched ${allInvoices.length} invoices from Firebase`);
      }

      // ★ Step 2: Save to localStorage cache temporarily so localDb can pick it up
      if (allInvoices.length > 0) {
        try {
          const cacheKey = `invoices_${user.uid}`;
          const existing = localStorage.getItem(cacheKey);
          const existingData = existing ? JSON.parse(existing) : { data: [], ts: 0 };
          
          // Only update if Firebase has more data than cache
          if (allInvoices.length > (existingData.data?.length || 0)) {
            localStorage.setItem(cacheKey, JSON.stringify({
              data: allInvoices.map(inv => ({
                ...inv, _raw: undefined,
                items: (inv.items || []).map(it => ({
                  name: it.name || '', nameSi: it.nameSi || '',
                  qty: it.qty || 0, lineTotal: it.lineTotal || 0,
                  yourPrice: it.yourPrice || 0, sellingPrice: it.sellingPrice || 0,
                  discAmount: it.discAmount || 0, costPrice: it.costPrice || 0,
                  allocatedCostTotal: it.allocatedCostTotal || 0,
                  photoURL: it.photoURL || '', uom: it.uom || '',
                  uomFactor: it.uomFactor || 1,
                })),
              })),
              ts: Date.now(),
            }));
            console.log(`✅ [Backup] Cache updated with ${allInvoices.length} invoices`);
          }
        } catch (e) {
          console.warn('[Backup] Cache update failed:', e.message);
        }
      }

      // ★ Step 3: Run the actual backup
      setStatusMessage('📦 Backup file generate කරමින්...');
      const fileName = await manualBackupToDisk(userId, 'manual');
      if (fileName) {
        setStatus('success');
        setStatusMessage(`✅ Backup saved: ${fileName} (${allInvoices.length} invoices from cloud)`);
        loadStats();
        loadFirebaseCounts();
        loadBackupFiles();
      } else {
        setStatus('error');
        setStatusMessage('❌ Export failed: No data returned');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage('❌ Export failed: ' + (error?.message || 'Unknown error'));
    }
  };

  // ── List Backup Files ──
  const loadBackupFiles = useCallback(async () => {
    try {
      const files = await listBackupFiles();
      if (Array.isArray(files)) {
        setBackupFiles(files);
        setShowFileList(true);
      } else {
        setBackupFiles([]);
        setShowFileList(true);
        setStatus('error');
        setStatusMessage('⚠️ Backup folder එකක් තෝරාගෙන නැහැ. "CHANGE" button එක click කරන්න.');
      }
    } catch (e) {
      console.warn('[Backup] List failed:', e);
      setBackupFiles([]);
      setShowFileList(true);
    }
  }, []);

  // ── Restore from Backup File ──
  const handleRestore = async (fileName) => {
    if (!window.confirm(`⚠️ "${fileName}" backup එකෙන් data restore කරන්නද?\n\nමේකෙන් දැනට තියෙන local data overwrite වෙනවා!`)) {
      return;
    }

    setRestoring(true);
    setStatus('exporting');
    setStatusMessage('🔄 Restoring from ' + fileName + '...');

    try {
      const backupData = await readBackupFile(fileName);
      if (!backupData) {
        setStatus('error');
        setStatusMessage('❌ Backup file read කළ නොහැක.');
        setRestoring(false);
        return;
      }

      const success = await restoreFromBackup(backupData);
      if (success) {
        setStatus('success');
        setStatusMessage('✅ Data restore සාර්ථකයි! Page එක refresh වෙනවා...');
        loadStats();
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setStatus('error');
        setStatusMessage('❌ Restore අසාර්ථකයි.');
      }
    } catch (e) {
      setStatus('error');
      setStatusMessage('❌ Restore error: ' + (e?.message || 'Unknown'));
    } finally {
      setRestoring(false);
    }
  };

  // ── Auto-Backup Toggle ──
  const handleAutoBackupToggle = async () => {
    const newValue = !autoBackupEnabled;
    setAutoBackupEnabled(newValue);
    localStorage.setItem('pos_auto_backup', String(newValue));

    if (newValue) {
      setStatus('exporting');
      setStatusMessage('🔄 Auto-backup setup + initial backup...');
      try {
        await autoBackupToDisk(userId);
        setStatus('success');
        setStatusMessage('✅ Auto-backup enabled! Data hard disk එකට save වෙනවා.');
        setTimeout(() => { setStatus('idle'); setStatusMessage(''); }, 4000);
      } catch (e) {
        setStatus('error');
        setStatusMessage('❌ Auto-backup setup failed: ' + (e?.message || 'Unknown'));
      }
    } else {
      setStatus('success');
      setStatusMessage('ℹ️ Auto-backup disabled.');
      setTimeout(() => { setStatus('idle'); setStatusMessage(''); }, 3000);
    }
  };

  // ── Open Backup Folder in File Explorer ──
  const handleOpenFolder = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.openBackupFolder) {
        const result = await window.electronAPI.openBackupFolder();
        if (result?.success) {
          console.log('📂 [Backup] Opened folder:', result.path);
        } else {
          setStatus('error');
          setStatusMessage('❌ Folder open කළ නොහැක: ' + (result?.error || 'Unknown'));
        }
      } else {
        setStatus('error');
        setStatusMessage('⚠️ මේ feature එක Electron වල විතරයි.');
      }
    } catch (e) {
      console.error('[Backup] Open folder error:', e);
    }
  };

  // ── Format helpers ──
  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('si-LK', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

// ✅ Server එකේ false, Client mount වුණාට පස්සේ true → No hydration mismatch!
const [isElectron, setIsElectron] = useState(false);
useEffect(() => {
  setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
}, []);

  // ★ Use Firebase counts if available, fallback to local stats
  const displayInvoices = firebaseCounts?.invoices ?? stats?.invoices ?? 0;
  const displayCustomers = firebaseCounts?.customers ?? stats?.customers ?? 0;
  const displayItems = firebaseCounts?.items ?? stats?.items ?? 0;
  const displayTotal = displayInvoices + displayCustomers + displayItems;

  return (
    <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', borderRadius: '16px', padding: '24px', color: '#ffffff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px' }}>☁️</span>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Cloud & Device Backup</h2>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#cbd5e1' }}>
        Vercel cloud එකේ data ඔබගේ PC hard disk එකට auto-save කරන්න.
      </p>

      {/* ★ Stats — Now shows REAL Firebase counts */}
      <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>📂 Local Backup Data</span>
          <strong>{displayTotal} records</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
          <span>📄 Invoices: {displayInvoices}</span>
          <span>👥 Customers: {displayCustomers}</span>
          <span>📦 Items: {displayItems}</span>
        </div>
        {firebaseCounts && (
          <div style={{ fontSize: '10px', color: '#22c55e', marginTop: '6px' }}>
            ✅ Cloud data (Firebase) — {stats ? `Local cache: ${stats.invoices || 0} invoices` : ''}
          </div>
        )}
        {!firebaseCounts && stats && (
          <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '6px' }}>
            ⚠️ Local cache පමණයි — {stats._total || 0} records ({formatSize(stats.totalSizeBytes)})
          </div>
        )}
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isElectron ? '1fr 1fr 1fr' : '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={status === 'exporting'}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#10b981', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <span>📥</span> {status === 'exporting' ? 'Exporting...' : 'Download Backup'}
        </button>
        <button
          type="button"
          onClick={() => { loadBackupFiles(); loadFirebaseCounts(); }}
          style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#6366f1', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <span>📋</span> View Backup Files
        </button>
        {isElectron && (
          <button
            type="button"
            onClick={handleOpenFolder}
            style={{ padding: '12px', borderRadius: '10px', border: 'none', background: '#f59e0b', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <span>📁</span> Open Folder
          </button>
        )}
      </div>

      {/* ── Auto-Backup Toggle ── */}
      <div style={{ marginBottom: '12px', padding: '12px 16px', background: autoBackupEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)', borderRadius: '10px', border: `1px solid ${autoBackupEnabled ? '#10b981' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700' }}>🔄 Auto-Backup to Hard Disk</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
            {autoBackupEnabled ? 'Vercel data auto-sync වුණාම hard disk එකට save වෙනවා' : 'Enable කළාම cloud data auto-save වෙනවා'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAutoBackupToggle}
          style={{
            padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '12px',
            background: autoBackupEnabled ? '#ef4444' : '#10b981',
            color: 'white',
          }}
        >
          {autoBackupEnabled ? '⏹ Disable' : '▶ Enable'}
        </button>
      </div>

      {/* ── Backup Folder Path ── */}
      <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ color: '#fbbf24' }}>🏠</span>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#fbbf24' }}>Backup Folder Path</h3>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#94a3b8' }}>
          {isElectron
            ? '✅ Electron: D: හෝ වෙනත් drive එකක folder එකක් select කරන්න'
            : '🌐 Browser: Chrome/Edge වල folder එකක් select කරන්න (D: drive support)'}
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ flex: 1, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}>
            {backupPath}
          </div>
          <button
            type="button"
            onClick={handleSelectBackupPath}
            style={{ padding: '8px 14px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            📂 CHANGE
          </button>
        </div>
      </div>

      {/* ── Backup Files List ── */}
      {showFileList && (
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>📁 Backup Files ({backupFiles.length})</h3>
            <button
              type="button"
              onClick={() => setShowFileList(false)}
              style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
            >
              ✕ Close
            </button>
          </div>

          {backupFiles.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
              ⚠️ Backup files හමු නොවීය. Folder එක select කර "Download Backup" click කරන්න.
            </p>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {backupFiles.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', marginBottom: '4px',
                    background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '12px',
                  }}
                >
                  <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#fbbf24' }}>📄</span> {file.name}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      {formatSize(file.size)} {file.lastModified && `• ${formatDate(file.lastModified)}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(file.name)}
                    disabled={restoring}
                    style={{
                      padding: '4px 10px', background: '#6366f1', color: '#fff',
                      border: 'none', borderRadius: '4px', fontSize: '10px',
                      fontWeight: 'bold', cursor: restoring ? 'not-allowed' : 'pointer',
                      marginLeft: '8px',
                    }}
                  >
                    🔄 Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Status Message ── */}
      {statusMessage && (
        <div style={{
          marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '12px',
          background: status === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
          border: status === 'error' ? '1px solid #ef4444' : '1px solid #10b981',
        }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
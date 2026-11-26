'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth, getDb, app } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  limit,
  startAfter,
  onSnapshot,
  getFirestore
} from 'firebase/firestore';
import localDb from '@/lib/localDb';
import { onAuthStateChanged } from 'firebase/auth';

// ══════════════════════════════════════════════════════════════
// SAFE FIRESTORE DB RESOLVER (PREVENTS ARGUMENT ERRORS)
// ══════════════════════════════════════════════════════════════
const getSafeFirestoreDb = () => {
  try {
    if (db && typeof db === 'object' && typeof db.type === 'string') return db;
    const directDb = getDb();
    if (directDb && typeof directDb === 'object') return directDb;
    if (app) return getFirestore(app);
  } catch (e) {}
  return db || null;
};

// ══════════════════════════════════════════════════════════════
// DATA SANITIZER FOR FIRESTORE
// ══════════════════════════════════════════════════════════════
const sanitizeForFirestore = (val) => {
  if (val === undefined || typeof val === 'function' || typeof val === 'symbol') {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
      return 0;
    }
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (val && typeof val === 'object' && (val.constructor?.name === 'FieldValue' || val._delegate)) {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .map(sanitizeForFirestore)
      .filter((item) => item !== null && item !== undefined);
  }
  const cleaned = {};
  for (const [key, value] of Object.entries(val)) {
    if (key === '_synced' || key === 'synced' || key === '_localSaved') continue;
    if (value !== undefined && typeof value !== 'function' && typeof value !== 'symbol') {
      const sanitizedVal = sanitizeForFirestore(value);
      if (sanitizedVal !== null && sanitizedVal !== undefined) {
        cleaned[key] = sanitizedVal;
      }
    }
  }
  return cleaned;
};

/* ═══════════════════════════════════════
   SAFE DEXIE DATABASE HELPERS
═══════════════════════════════════════ */
const ensureDbOpen = async () => {
  if (!localDb) return false;
  try {
    if (!localDb.isOpen()) {
      await localDb.open();
    }
    return true;
  } catch (err) {
    try {
      if (typeof localDb.open === 'function') {
        await localDb.open();
        return true;
      }
    } catch (retryErr) {}
    return false;
  }
};

const getSafeDocs = async (table) => {
  if (!table || !localDb) return [];
  try {
    const isOpen = await ensureDbOpen();
    if (!isOpen) return [];
    return await table.toArray();
  } catch (err) {
    return [];
  }
};

const safePut = async (table, record) => {
  if (!table || !localDb) return;
  try {
    const isOpen = await ensureDbOpen();
    if (!isOpen) return;
    await table.put(record);
  } catch (err) {}
};

const safeBulkPut = async (table, records) => {
  if (!table || !records || !records.length || !localDb) return;
  try {
    const isOpen = await ensureDbOpen();
    if (!isOpen) return;
    await table.bulkPut(records);
  } catch (err) {}
};

export default function SyncButton() {
  const [isDuplicate, setIsDuplicate]   = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);
  const [fbUser, setFbUser]             = useState(null);
  const [statusMsg, setStatusMsg]       = useState('');
  const [showMenu, setShowMenu]         = useState(false);

  const fileInputRef = useRef(null);
  const isSyncingRef = useRef(false);
  const quotaCooldownRef = useRef(0);

  // Prevent multiple floating buttons
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.__SYNC_BTN_MOUNTED__) {
        setIsDuplicate(true);
      } else {
        window.__SYNC_BTN_MOUNTED__ = true;
      }
    }
    return () => {
      if (typeof window !== 'undefined' && !isDuplicate) {
        window.__SYNC_BTN_MOUNTED__ = false;
      }
    };
  }, [isDuplicate]);

  // Position Dragging
  const [position, setPosition]       = useState({ x: null, y: null });
  const [isDragging, setIsDragging]   = useState(false);
  const dragStartRef                  = useRef({ x: 0, y: 0 });
  const initialPosRef                 = useRef({ x: 0, y: 0 });
  const hasDraggedRef                 = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || isDuplicate) return;
    const savedPos = localStorage.getItem('sync_button_pos');
    if (savedPos) {
      try {
        const parsed = JSON.parse(savedPos);
        const clampedX = Math.max(10, Math.min(window.innerWidth - 220, parsed.x));
        const clampedY = Math.max(10, Math.min(window.innerHeight - 80, parsed.y));
        setPosition({ x: clampedX, y: clampedY });
        return;
      } catch (e) {}
    }
    setPosition({
      x: Math.max(10, window.innerWidth - 220),
      y: Math.max(10, window.innerHeight - 80),
    });
  }, [isDuplicate]);

  useEffect(() => {
    if (isDuplicate) return;
    const unsub = onAuthStateChanged(auth, (u) => setFbUser(u));
    return () => unsub();
  }, [isDuplicate]);

  const isItemUnsynced = (item) => {
    if (!item) return false;
    if (item._synced === false || item.synced === false || item.synced === 0 || item._localSaved === true) {
      return true;
    }
    return !item.synced && item._synced !== true;
  };

  // ══════════════════════════════════════════════════════════════
  // 1. AUTO-UPLOAD LOCAL -> CLOUD (ALL CORE POS TABLES)
  // ══════════════════════════════════════════════════════════════
  const autoUploadLocalToCloud = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (Date.now() < quotaCooldownRef.current) return;
    if (!navigator.onLine || !localDb) return;

    const firestore = getSafeFirestoreDb();
    if (!firestore) return;

    const dbOpen = await ensureDbOpen();
    if (!dbOpen) return;

    isSyncingRef.current = true;
    try {
      const syncTargets = [
        { table: localDb.items,            col: 'items',            idKey: 'id' },
        { table: localDb.customers,        col: 'customers',        idKey: 'id' },
        { table: localDb.customerLoans,    col: 'customerLoans',    idKey: 'id' },
        { table: localDb.invoices,         col: 'invoices',         idKey: 'id' },
        { table: localDb.purchases,        col: 'purchases',        idKey: 'id' },
        { table: localDb['purchase-returns'], col: 'purchase-returns', idKey: 'id' },
        { table: localDb.suppliers,        col: 'suppliers',        idKey: 'id' },
        { table: localDb.payments,         col: 'payments',         idKey: 'id' },
        { table: localDb.cashTransactions, col: 'cashTransactions', idKey: 'id' },
        { table: localDb.bankAccounts,     col: 'bankAccounts',     idKey: 'id' },
      ];

      const activeUid = fbUser?.uid || auth?.currentUser?.uid || 'system';
      const nowIso = new Date().toISOString();
      let totalUnsynced = 0;

      for (const target of syncTargets) {
        if (!target.table) continue;
        const allLocal = await getSafeDocs(target.table);
        const unsynced = allLocal.filter(isItemUnsynced);
        totalUnsynced += unsynced.length;

        // Process in small batches of 10 to avoid overwhelming network
        const batch = unsynced.slice(0, 15);
        for (const item of batch) {
          try {
            const rawId = item[target.idKey] || item.docId || item.localId || item.firestoreId;
            if (!rawId) continue;
            const docId = String(rawId).replace(/[/\\#?]/g, '_');

            const syncedRecord = {
              ...item,
              id: docId,
              uid: item.uid || activeUid,
              synced: 1,
              _synced: true,
              _localSaved: false,
              syncedAt: nowIso,
              updatedAt: item.updatedAt || nowIso,
            };

            const cleanDoc = sanitizeForFirestore(syncedRecord);
            const docRef = doc(firestore, target.col, docId);

            await setDoc(docRef, cleanDoc, { merge: true });
            await safePut(target.table, syncedRecord);
            totalUnsynced = Math.max(0, totalUnsynced - 1);
          } catch (e) {
            if (e?.code === 'resource-exhausted') {
              quotaCooldownRef.current = Date.now() + 60000;
              break;
            }
          }
        }
      }

      setPendingCount(totalUnsynced);
    } catch (e) {
      // Non-blocking catch
    } finally {
      isSyncingRef.current = false;
    }
  }, [fbUser]);

  // ══════════════════════════════════════════════════════════════
  // 2. REAL-TIME CLOUD -> LOCAL LISTENERS (SAFE & RESILIENT)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (isDuplicate || !navigator.onLine) return;

    const firestore = getSafeFirestoreDb();
    if (!firestore) return;

    const unsubs = [];

    const setupListener = (colName, localTable, customMapping) => {
      if (!localTable) return;
      try {
        const colRef = collection(firestore, colName);
        const unsub = onSnapshot(
          colRef,
          (snapshot) => {
            const docsToPut = [];
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added' || change.type === 'modified') {
                const data = change.doc.data();
                docsToPut.push(
                  customMapping
                    ? customMapping(change.doc.id, data)
                    : {
                        id: change.doc.id,
                        ...data,
                        synced: 1,
                        _synced: true,
                        _localSaved: false,
                      }
                );
              }
            });
            if (docsToPut.length > 0) {
              safeBulkPut(localTable, docsToPut);
            }
          },
          (err) => {
            // Quiet fallback for quota/permission
          }
        );
        unsubs.push(unsub);
      } catch (err) {}
    };

    setupListener('items', localDb.items, (id, data) => ({
      id,
      docId: id,
      ...data,
      currentStock: data.currentStock ?? data.stock ?? 0,
      synced: 1,
      _synced: true,
      _localSaved: false,
    }));
    setupListener('customers', localDb.customers);
    setupListener('customerLoans', localDb.customerLoans);
    setupListener('invoices', localDb.invoices);
    setupListener('purchases', localDb.purchases);
    setupListener('suppliers', localDb.suppliers);

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, [isDuplicate]);

  // ══════════════════════════════════════════════════════════════
  // 3. CONTINUOUS BACKGROUND AUTO-SYNC LOOP (EVERY 10 SECONDS)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (isDuplicate) return;

    autoUploadLocalToCloud();
    const interval = setInterval(() => {
      autoUploadLocalToCloud();
    }, 10000);

    const handleOnline = () => {
      setStatusMsg('🌐 Online! Auto-Syncing...');
      autoUploadLocalToCloud();
      setTimeout(() => setStatusMsg(''), 4000);
    };

    window.addEventListener('online', handleOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [autoUploadLocalToCloud, isDuplicate]);

  // ══════════════════════════════════════════════════════════════
  // BACKUP & RESTORE UTILITIES
  // ══════════════════════════════════════════════════════════════
  const saveJsonFileWithPicker = async (fileName, jsonContent) => {
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'JSON Full System Backup', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        return true;
      } catch (saveErr) {
        if (saveErr?.name === 'AbortError') return false;
      }
    }
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  };

  const handleExportLocalToFile = async () => {
    if (!localDb) {
      alert('Local Database සොයාගත නොහැක.');
      return;
    }

    setSyncing(true);
    try {
      const localExport = {};
      const tables = [
        { name: 'items', table: localDb.items, label: 'Items' },
        { name: 'customers', table: localDb.customers, label: 'Customers' },
        { name: 'customerLoans', table: localDb.customerLoans, label: 'Loans' },
        { name: 'invoices', table: localDb.invoices, label: 'Invoices' },
        { name: 'purchases', table: localDb.purchases, label: 'Purchases' },
        { name: 'suppliers', table: localDb.suppliers, label: 'Suppliers' },
        { name: 'payments', table: localDb.payments, label: 'Payments' },
        { name: 'cashTransactions', table: localDb.cashTransactions, label: 'Cash Transactions' },
      ];

      let totalRecords = 0;
      for (const t of tables) {
        if (!t.table) continue;
        setStatusMsg(`💾 Local ${t.label} කියවමින්...`);
        const docs = await getSafeDocs(t.table);
        localExport[t.name] = docs;
        totalRecords += docs.length;
      }

      if (totalRecords === 0) {
        alert('⚠️ Local Database එකේ Records නොමැත.');
        return;
      }

      const fileName = `Weerakkodi_POS_Backup_${new Date().toISOString().slice(0, 10)}_${Date.now().toString(36)}.json`;
      const saved = await saveJsonFileWithPicker(fileName, JSON.stringify(localExport, null, 2));

      if (saved) {
        setStatusMsg(`🎉 Records ${totalRecords}ක් File එකට Save විය!`);
        alert(`🎉 Local Backup සාර්ථකයි!\n\n📦 මුළු Records: ${totalRecords}\n📄 File: ${fileName}`);
      }
    } catch (e) {
      alert('Local Export දෝෂයක්: ' + (e?.message || e));
    } finally {
      setSyncing(false);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const processRestoreFile = async (file) => {
    if (!file || !localDb) return;

    setSyncing(true);
    setStatusMsg('📂 Backup File කියවමින්...');

    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        alert('⚠️ මෙය වලංගු JSON File එකක් නොවේ!');
        return;
      }

      const restoreMap = [
        { key: 'items', table: localDb.items, label: 'Items' },
        { key: 'customers', table: localDb.customers, label: 'Customers' },
        { key: 'customerLoans', table: localDb.customerLoans, label: 'Loans' },
        { key: 'invoices', table: localDb.invoices, label: 'Invoices' },
        { key: 'purchases', table: localDb.purchases, label: 'Purchases' },
        { key: 'suppliers', table: localDb.suppliers, label: 'Suppliers' },
        { key: 'payments', table: localDb.payments, label: 'Payments' },
        { key: 'cashTransactions', table: localDb.cashTransactions, label: 'Cash Transactions' },
      ];

      const CHUNK = 500;
      const summaryLines = [];
      const restoredByTable = [];

      for (const r of restoreMap) {
        const records = Array.isArray(parsed[r.key]) ? parsed[r.key] : [];
        if (!records.length || !r.table) continue;

        const normalized = records.map((rec, idx) => {
          const id = String(rec.id || rec.docId || `${r.key}_${Date.now()}_${idx}`);
          return {
            ...rec,
            id,
            docId: id,
            synced: rec.synced ?? 1,
            _synced: rec._synced ?? true,
            _localSaved: false,
          };
        });

        for (let i = 0; i < normalized.length; i += CHUNK) {
          await safeBulkPut(r.table, normalized.slice(i, i + CHUNK));
          const done = Math.min(i + CHUNK, normalized.length);
          setStatusMsg(`⚡ ${r.label} Load වෙමින්: ${done}/${normalized.length}...`);
          await new Promise((res) => setTimeout(res, 10));
        }

        summaryLines.push(`✅ ${r.label}: ${normalized.length}`);
        restoredByTable.push({ table: r.table, records: normalized });
      }

      const totalRestored = restoredByTable.reduce((s, x) => s + x.records.length, 0);
      alert(`🎉 Backup Restore සාර්ථකයි!\n\n${summaryLines.join('\n')}\n\n📦 මුළු Records: ${totalRestored}`);

      if (totalRestored > 0 && confirm('Restore කළ Records Cloud (Firebase) එකටත් Sync කරන්නද?')) {
        for (const { table, records } of restoredByTable) {
          const flagged = records.map((r) => ({ ...r, synced: 0, _synced: false }));
          await safeBulkPut(table, flagged);
        }
        await autoUploadLocalToCloud();
      }
    } catch (e) {
      alert('Restore දෝෂයක්: ' + (e?.message || e));
    } finally {
      setSyncing(false);
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  const handleRestoreFromFile = async () => {
    if (syncing) return;
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'POS JSON Backup', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        await processRestoreFile(file);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleManualSyncNow = async () => {
    setSyncing(true);
    setStatusMsg('⚡ Sync වෙමින් පවතී...');
    await autoUploadLocalToCloud();
    setStatusMsg('✅ Sync සම්පූර්ණයි!');
    setSyncing(false);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // Dragging event handlers
  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { x: clientX, y: clientY };
    initialPosRef.current = { ...position };
    hasDraggedRef.current = false;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging || isDuplicate) return;
    const handlePointerMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - dragStartRef.current.x;
      const deltaY = clientY - dragStartRef.current.y;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        hasDraggedRef.current = true;
      }
      const newX = Math.max(10, Math.min(window.innerWidth - 220, initialPosRef.current.x + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, initialPosRef.current.y + deltaY));
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      if (hasDraggedRef.current) {
        localStorage.setItem('sync_button_pos', JSON.stringify(position));
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, position, isDuplicate]);

  if (isDuplicate || position.x === null || position.y === null) return null;

  const isTopHalf = position.y < (typeof window !== 'undefined' ? window.innerHeight / 2 : 400);

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await processRestoreFile(file);
        }}
      />

      {statusMsg && (
        <div
          style={{
            position: 'absolute',
            [isTopHalf ? 'top' : 'bottom']: '55px',
            right: '0',
            backgroundColor: '#1e293b',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            border: '1px solid #334155',
          }}
        >
          {statusMsg}
        </div>
      )}

      {showMenu && (
        <div
          style={{
            position: 'absolute',
            [isTopHalf ? 'top' : 'bottom']: '55px',
            right: '0',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            border: '1px solid #e2e8f0',
            padding: '8px',
            minWidth: '260px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <button
            onClick={() => { setShowMenu(false); handleManualSyncNow(); }}
            disabled={syncing}
            style={{
              padding: '10px 14px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
            }}
          >
            <span>⚡ Sync Now ({pendingCount})</span>
            <small style={{ opacity: 0.85 }}>Local ↔ Cloud</small>
          </button>

          <button
            onClick={() => { setShowMenu(false); handleExportLocalToFile(); }}
            disabled={syncing}
            style={{
              padding: '10px 14px',
              backgroundColor: '#8b5cf6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
            }}
          >
            <span>💾 Backup to File</span>
            <small style={{ opacity: 0.85 }}>PC → JSON</small>
          </button>

          <button
            onClick={() => { setShowMenu(false); handleRestoreFromFile(); }}
            disabled={syncing}
            style={{
              padding: '10px 14px',
              backgroundColor: '#f97316',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
            }}
          >
            <span>📂 Restore Backup</span>
            <small style={{ opacity: 0.85 }}>JSON → PC</small>
          </button>
        </div>
      )}

      <div
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={() => { if (!hasDraggedRef.current) setShowMenu(!showMenu); }}
        style={{
          backgroundColor: pendingCount > 0 ? '#f59e0b' : '#10b981',
          color: '#ffffff',
          border: 'none',
          padding: '10px 18px',
          borderRadius: '30px',
          fontWeight: 'bold',
          cursor: isDragging ? 'grabbing' : syncing ? 'wait' : 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
        }}
      >
        <span style={{ cursor: 'grab', fontSize: '16px', opacity: 0.8 }}>⋮⋮</span>
        <span>
          {syncing
            ? '⏳ Syncing...'
            : pendingCount > 0
            ? `🔄 Syncing (${pendingCount})`
            : `🟢 Synced (Equal)`}
        </span>
      </div>
    </div>
  );
}
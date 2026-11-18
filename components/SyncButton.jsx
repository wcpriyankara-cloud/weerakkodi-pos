'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  limit,
  startAfter,
  onSnapshot,
} from 'firebase/firestore';
import { localDb } from '@/lib/localDb';
import { onAuthStateChanged } from 'firebase/auth';

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
  // Preserve Firestore FieldValue objects safely
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
    if (value !== undefined && typeof value !== 'function' && typeof value !== 'symbol') {
      const sanitizedVal = sanitizeForFirestore(value);
      if (sanitizedVal !== null && sanitizedVal !== undefined) {
        cleaned[key] = sanitizedVal;
      }
    }
  }
  return cleaned;
};

export default function SyncButton() {
  const [isDuplicate, setIsDuplicate]   = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);
  const [fbUser, setFbUser]             = useState(null);
  const [statusMsg, setStatusMsg]       = useState('');
  const [showMenu, setShowMenu]         = useState(false);

  // Prevent multiple buttons on screen
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

  // Dragging Position
  const [position, setPosition]         = useState({ x: null, y: null });
  const [isDragging, setIsDragging]     = useState(false);
  const dragStartRef                    = useRef({ x: 0, y: 0 });
  const initialPosRef                   = useRef({ x: 0, y: 0 });
  const hasDraggedRef                   = useRef(false);

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
    const handleResize = () => {
      setPosition((prev) => {
        if (prev.x === null || prev.y === null) return prev;
        return {
          x: Math.max(10, Math.min(window.innerWidth - 220, prev.x)),
          y: Math.max(10, Math.min(window.innerHeight - 80, prev.y)),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDuplicate]);

  useEffect(() => {
    if (isDuplicate) return;
    const unsub = onAuthStateChanged(auth, (u) => setFbUser(u));
    return () => unsub();
  }, [isDuplicate]);

  // Helper check for unsynced item
  const isItemUnsynced = (item) => {
    if (!item) return false;
    if (item._synced === false || item.synced === false || item.synced === 0 || item._localSaved === true) {
      return true;
    }
    return !item.synced && item._synced !== true;
  };

  // Safe table fetcher
  const getSafeDocs = async (table) => {
    if (!table) return [];
    try {
      return await table.toArray();
    } catch (err) {
      console.warn(`[Sync] Error reading table:`, err?.message || err);
      return [];
    }
  };

  // ══ 1. Auto-Upload Local -> Cloud (All 5 Core Collections) ══
  const autoUploadLocalToCloud = useCallback(async () => {
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser || !navigator.onLine || !localDb) return;

    try {
      const syncTargets = [
        { table: localDb.invoices, col: 'invoices', idKey: 'id' },
        { table: localDb.customers, col: 'customers', idKey: 'id' },
        { table: localDb.items, col: 'items', idKey: 'id' },
        { table: localDb.purchases, col: 'purchases', idKey: 'id' },
        { table: localDb.suppliers, col: 'suppliers', idKey: 'id' },
      ];

      const nowIso = new Date().toISOString();

      for (const target of syncTargets) {
        if (!target.table) continue;
        const allLocal = await getSafeDocs(target.table);
        const unsynced = allLocal.filter(isItemUnsynced);

        for (const item of unsynced) {
          try {
            const rawId = item[target.idKey] || item.docId || Date.now();
            const docId = String(rawId).replace(/[/\\#?]/g, '_');

            const syncedRecord = {
              ...item,
              id: docId,
              synced: 1,
              _synced: true,
              _localSaved: false,
              syncedAt: nowIso,
              updatedAt: item.updatedAt || nowIso,
            };

            const cleanDoc = sanitizeForFirestore(syncedRecord);

            await setDoc(doc(db, target.col, docId), cleanDoc, { merge: true });
            await target.table.put(syncedRecord);
          } catch (e) {
            console.warn(`[Auto-Upload] Error uploading ${target.col} ${item.id}:`, e?.message || e);
          }
        }
      }

      // Compute total remaining pending records
      let remaining = 0;
      for (const target of syncTargets) {
        if (target.table) {
          const allDocs = await getSafeDocs(target.table);
          remaining += allDocs.filter(isItemUnsynced).length;
        }
      }
      setPendingCount(remaining);
    } catch (e) {
      console.warn('[Auto-Upload] Global error:', e?.message || e);
    }
  }, [fbUser]);

  // ══ 2. Real-time Cloud -> Local Listeners ══
  useEffect(() => {
    if (isDuplicate || !navigator.onLine) return;
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) return;

    const unsubs = [];

    const setupListener = (colName, localTable, customMapping) => {
      if (!localTable) return;
      try {
        const unsub = onSnapshot(
          collection(db, colName),
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
              localTable.bulkPut(docsToPut).catch(() => {});
            }
          },
          (err) => console.warn(`[Snapshot] ${colName} error:`, err?.message || err)
        );
        unsubs.push(unsub);
      } catch (err) {
        console.warn(`[Snapshot Setup] ${colName} error:`, err?.message || err);
      }
    };

    setupListener('invoices', localDb.invoices, (id, data) => ({
      id,
      docId: id,
      ...data,
      synced: 1,
      _synced: true,
      _localSaved: false,
    }));
    setupListener('customers', localDb.customers);
    setupListener('items', localDb.items, (id, data) => ({
      id,
      docId: id,
      ...data,
      currentStock: data.currentStock ?? data.stock ?? 0,
      synced: 1,
      _synced: true,
      _localSaved: false,
    }));
    setupListener('purchases', localDb.purchases);
    setupListener('suppliers', localDb.suppliers);

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, [fbUser, isDuplicate]);

  // ══ 3. Continuous Background Auto-Sync Loop (Every 8 seconds) ══
  useEffect(() => {
    if (isDuplicate) return;

    autoUploadLocalToCloud();
    const interval = setInterval(autoUploadLocalToCloud, 8000);

    const handleOnline = () => {
      setStatusMsg('🌐 Online! Auto-Syncing missing records...');
      autoUploadLocalToCloud();
      setTimeout(() => setStatusMsg(''), 4000);
    };

    window.addEventListener('online', handleOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [autoUploadLocalToCloud, isDuplicate]);

  // Manual Trigger Functions
  const handleUploadPending = async () => {
    setSyncing(true);
    setStatusMsg('Local Data Cloud එකට Upload වෙමින්...');
    await autoUploadLocalToCloud();
    setStatusMsg('✅ Local Data සාර්ථකව Sync විය!');
    setSyncing(false);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleDownloadAllToPC = async () => {
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) {
      alert('Cloud වෙතින් දත්ත Download කිරීමට ප්‍රථමයෙන් Login වන්න.');
      return;
    }

    if (
      !confirm(
        'Cloud හි ඇති සියලුම Records (Invoices, Customers, Items, Purchases, Suppliers) PC Hard Disc එකට Save කර File Location එකක් තෝරාගැනීමට අවශ්‍යද?'
      )
    ) {
      return;
    }

    setSyncing(true);
    const fullBackupExport = {};

    const collectionsToDownload = [
      { name: 'invoices', localTable: localDb.invoices, label: 'Invoices' },
      { name: 'customers', localTable: localDb.customers, label: 'Customers' },
      { name: 'items', localTable: localDb.items, label: 'Items' },
      { name: 'purchases', localTable: localDb.purchases, label: 'Purchases' },
      { name: 'suppliers', localTable: localDb.suppliers, label: 'Suppliers' },
    ];

    try {
      for (const colDef of collectionsToDownload) {
        if (!colDef.localTable) continue;

        setStatusMsg(`${colDef.label} Download වෙමින්...`);
        let totalColDownloaded = 0;
        let lastDoc = null;
        let hasMore = true;
        const batchSize = 100;
        const colDocs = [];

        while (hasMore) {
          let q = lastDoc
            ? query(collection(db, colDef.name), startAfter(lastDoc), limit(batchSize))
            : query(collection(db, colDef.name), limit(batchSize));

          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            hasMore = false;
            break;
          }

          const batchData = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const record = {
              id: docSnap.id,
              docId: docSnap.id,
              ...data,
              synced: 1,
              _synced: true,
              _localSaved: false,
            };

            if (colDef.name === 'items') {
              record.currentStock = record.currentStock ?? record.stock ?? 0;
            }

            batchData.push(record);
            colDocs.push(record);
          });

          await colDef.localTable.bulkPut(batchData);
          totalColDownloaded += batchData.length;
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
          setStatusMsg(`${colDef.label} Save වෙමින්: ${totalColDownloaded}...`);

          await new Promise((resolve) => setTimeout(resolve, 50));

          if (snapshot.docs.length < batchSize) {
            hasMore = false;
          }
        }

        fullBackupExport[colDef.name] = colDocs;
      }

      setStatusMsg('🎉 සියලුම Records සාර්ථකව PC Hard Disc එකට Save විය!');

      const fileName = `Weerakkodi_POS_FullSystem_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      const jsonContent = JSON.stringify(fullBackupExport, null, 2);

      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'JSON Full System Backup', accept: { 'application/json': ['.json'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonContent);
          await writable.close();
          alert('🎉 සියලුම Records ඔබ තෝරාගත් PC Location එකේ Save කරන ලදී!');
        } catch (saveErr) {}
      } else {
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert('Download දෝෂයක්: ' + (e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

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

  const activeUser = fbUser || auth.currentUser;
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
            minWidth: '240px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <button
            onClick={() => { setShowMenu(false); handleUploadPending(); }}
            disabled={syncing || !activeUser}
            style={{
              padding: '10px 14px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: activeUser ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
            }}
          >
            <span>⬆️ Upload Unsynced ({pendingCount})</span>
            <small style={{ opacity: 0.8 }}>PC → Cloud</small>
          </button>

          <button
            onClick={() => { setShowMenu(false); handleDownloadAllToPC(); }}
            disabled={syncing || !activeUser}
            style={{
              padding: '10px 14px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: activeUser ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
            }}
          >
            <span>⬇️ Full Export to File</span>
            <small style={{ opacity: 0.8 }}>Cloud → File</small>
          </button>
        </div>
      )}

      <div
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={() => { if (!hasDraggedRef.current) setShowMenu(!showMenu); }}
        style={{
          backgroundColor: !activeUser ? '#64748b' : pendingCount > 0 ? '#f59e0b' : '#10b981',
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
            ? '⏳ Auto-Syncing...'
            : !activeUser
            ? `🔒 Login to Auto-Sync`
            : pendingCount > 0
            ? `🔄 Auto-Syncing (${pendingCount})`
            : `🟢 Auto-Synced (Equal)`}
        </span>
      </div>
    </div>
  );
}
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
  serverTimestamp,
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

  // Position
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

  const checkPending = useCallback(async () => {
    try {
      if (!localDb || !localDb.invoices) return;
      const count = await localDb.invoices
        .filter((inv) => !inv.synced || inv.synced === 0)
        .count();
      setPendingCount(count);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (isDuplicate) return;
    checkPending();
    const interval = setInterval(checkPending, 10000);
    return () => clearInterval(interval);
  }, [checkPending, isDuplicate]);

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

  const handleButtonClick = () => {
    if (hasDraggedRef.current) return;
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) {
      alert('Cloud Sync විශේෂාංගය සඳහා කරුණාකර පළමුව Log In වන්න.');
      return;
    }
    setShowMenu(!showMenu);
  };

  // 1. Local ➡️ Cloud Upload
  const handleUploadPending = async () => {
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) return;

    setSyncing(true);
    setStatusMsg('Local Invoices Cloud එකට Upload වෙමින්...');

    try {
      const pendingInvoices = await localDb.invoices
        .filter((inv) => !inv.synced || inv.synced === 0)
        .toArray();

      if (pendingInvoices.length === 0) {
        setStatusMsg('Upload කිරීමට අලුත් Invoices නැත.');
        setSyncing(false);
        return;
      }

      let successCount = 0;
      for (const inv of pendingInvoices) {
        try {
          const rawDocId = inv.id || inv.docId || inv.invoiceNo || Date.now();
          const docId = String(rawDocId).replace(/[/\\#?]/g, '_');
          const cleanInv = sanitizeForFirestore({
            ...inv,
            id: docId,
            synced: true,
            syncedAt: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          });

          await setDoc(doc(db, 'customerTransactions', docId), cleanInv, { merge: true });
          await localDb.invoices.put({ ...inv, id: inv.id || docId, synced: 1 });
          successCount++;
        } catch (err) {}
      }

      setStatusMsg(`✅ Invoices ${successCount} ක් සාර්ථකව Sync විය!`);
      await checkPending();
    } catch (e) {
      setStatusMsg('Upload දෝෂයක්: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // 2. Download ALL Firestore collections to PC Hard Disc & Prompt Save Location
  const handleDownloadAllToPC = async () => {
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) {
      alert('Cloud වෙතින් දත්ත Download කිරීමට ප්‍රථමයෙන් Login වන්න.');
      return;
    }

    if (!confirm('Cloud හි ඇති සියලුම Records (Invoices, Customers, Items, Purchases, Suppliers) PC Hard Disc එකට Save කර File එක Save කරන ස්ථානය තෝරාගැනීමට අවශ්‍යද?')) {
      return;
    }

    setSyncing(true);
    const fullBackupExport = {};

    const collectionsToDownload = [
      { name: 'customerTransactions', localTable: localDb.invoices, label: 'Invoices' },
      { name: 'invoices', localTable: localDb.invoices, label: 'Invoices (Alt)' },
      { name: 'customers', localTable: localDb.customers, label: 'Customers' },
      { name: 'items', localTable: localDb.items, label: 'Items' },
      { name: 'purchases', localTable: localDb.purchases, label: 'Purchases' },
      { name: 'suppliers', localTable: localDb.suppliers, label: 'Suppliers' },
    ];

    try {
      for (const colDef of collectionsToDownload) {
        if (!colDef.localTable) continue;

        setStatusMsg(`${colDef.label} Cloud වෙතින් Download වෙමින්...`);
        let totalColDownloaded = 0;
        let lastDoc = null;
        let hasMore = true;
        const batchSize = 100; // Safe memory chunk size
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
            const record = { id: docSnap.id, docId: docSnap.id, ...data, synced: 1 };
            batchData.push(record);
            colDocs.push(record);
          });

          // Bulk Put to Local Dexie DB
          await colDef.localTable.bulkPut(batchData);

          totalColDownloaded += batchData.length;
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
          setStatusMsg(`${colDef.label} Save වෙමින්: ${totalColDownloaded}...`);

          // Pause briefly to free CPU & RAM (Prevents 1450 stalling)
          await new Promise((resolve) => setTimeout(resolve, 50));

          if (snapshot.docs.length < batchSize) {
            hasMore = false;
          }
        }

        fullBackupExport[colDef.name] = colDocs;
      }

      setStatusMsg('🎉 සියලුම Records සාර්ථකව PC Hard Disc එකට Save විය!');

      // Save File Location Prompt
      const fileName = `Weerakkodi_POS_FullSystem_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      const jsonContent = JSON.stringify(fullBackupExport, null, 2);

      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'JSON Full System Backup',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonContent);
          await writable.close();
          alert('🎉 සියලුම Cloud Records ඔබ තෝරාගත් PC Location එකේ Save කරන ලදී!');
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

      await checkPending();
    } catch (e) {
      console.error('Download to PC error:', e);
      setStatusMsg('Download දෝෂයක්: ' + e.message);
      alert('Download දෝෂයක්: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleForceClearUnsynced = async () => {
    if (!confirm('Stuck වී ඇති නොගැලපෙන Local Data සාර්ථකව Synced ලෙස Mark කර ඉවත් කිරීමට අවශ්‍යද?')) return;
    try {
      const pendingInvoices = await localDb.invoices
        .filter((inv) => !inv.synced || inv.synced === 0)
        .toArray();

      for (const inv of pendingInvoices) {
        await localDb.invoices.put({ ...inv, synced: 1 });
      }
      setStatusMsg('🧹 Stuck Items Clear විය!');
      await checkPending();
    } catch (e) {}
  };

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
            <span>⬆️ Upload Local ({pendingCount})</span>
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
            <span>⬇️ Save All to PC Hard Disc</span>
            <small style={{ opacity: 0.8 }}>Cloud → PC</small>
          </button>

          {pendingCount > 0 && (
            <button
              onClick={() => { setShowMenu(false); handleForceClearUnsynced(); }}
              style={{
                padding: '8px 14px',
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '12px',
              }}
            >
              🧹 Clear Stuck Unsynced ({pendingCount})
            </button>
          )}
        </div>
      )}

      <div
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={handleButtonClick}
        style={{
          backgroundColor: !activeUser ? '#64748b' : pendingCount > 0 ? '#ef4444' : '#10b981',
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
            : !activeUser
            ? `🔒 Login to Sync (${pendingCount})`
            : `🔄 Sync Options (${pendingCount})`}
        </span>
      </div>
    </div>
  );
}
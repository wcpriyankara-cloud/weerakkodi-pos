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

// Deep sanitize helper to render valid Firestore data (strips undefined, NaN, functions)
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
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);
  const [fbUser, setFbUser]             = useState(null);
  const [statusMsg, setStatusMsg]       = useState('');
  const [showMenu, setShowMenu]         = useState(false);

  // ══ Dragging State & Position ══
  const [position, setPosition]         = useState({ x: null, y: null });
  const [isDragging, setIsDragging]     = useState(false);
  const dragStartRef                    = useRef({ x: 0, y: 0 });
  const initialPosRef                   = useRef({ x: 0, y: 0 });
  const hasDraggedRef                   = useRef(false);

  // Load saved position or set default to bottom-right
  useEffect(() => {
    if (typeof window === 'undefined') return;

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

    // Default: Bottom Right
    setPosition({
      x: Math.max(10, window.innerWidth - 220),
      y: Math.max(10, window.innerHeight - 80),
    });
  }, []);

  // Keep button inside screen on window resize
  useEffect(() => {
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
  }, []);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
    });
    return () => unsub();
  }, []);

  // Count unsynced local invoices
  const checkPending = useCallback(async () => {
    try {
      if (!localDb || !localDb.invoices) return;
      const count = await localDb.invoices
        .filter((inv) => !inv.synced || inv.synced === 0)
        .count();
      setPendingCount(count);
    } catch (e) {
      console.warn('Check pending count error:', e);
    }
  }, []);

  useEffect(() => {
    checkPending();
    const interval = setInterval(checkPending, 10000);
    return () => clearInterval(interval);
  }, [checkPending]);

  // ══ Drag Motion Handlers ══
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
    if (!isDragging) return;

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
  }, [isDragging, position]);

  const handleButtonClick = () => {
    if (hasDraggedRef.current) return;
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) {
      alert('Cloud Sync විශේෂාංගය සඳහා කරුණාකර පළමුව Log In වන්න.');
      return;
    }
    setShowMenu(!showMenu);
  };

  // 1. Upload Pending Local Invoices to Cloud (Local ➡️ Cloud)
  const handleUploadPending = async () => {
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) {
      alert('කරුණාකර Cloud Sync සඳහා ප්‍රථමයෙන් Login වන්න.');
      return;
    }

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
      let failCount = 0;

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

          // Safe Dexie update using put (upsert)
          await localDb.invoices.put({
            ...inv,
            id: inv.id || docId,
            synced: 1,
          });

          successCount++;
        } catch (err) {
          console.error(`Failed to sync invoice item:`, inv, err);
          failCount++;
        }
      }

      if (failCount > 0) {
        setStatusMsg(`⚠️ Invoices ${successCount} ක් Sync විය. ${failCount} ක් අසාර්ථක විය.`);
        alert(`අවධානයයි: Invoices ${successCount} ක් Sync වූ අතර ${failCount} ක් Sync නොවීය. අවශ්‍ය නම් "Clear Stuck Items" ක්ලික් කරන්න.`);
      } else {
        setStatusMsg(`✅ Local Invoices ${successCount} ම සාර්ථකව Sync විය!`);
      }
      await checkPending();
    } catch (e) {
      console.error('Sync upload error:', e);
      setStatusMsg('Upload දෝෂයක්: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // 2. Download ALL Firestore Invoices & Save to PC Hard Disc (Cloud ➡️ PC Hard Disc)
  const handleDownloadAllToPC = async () => {
    const activeUser = fbUser || auth.currentUser;
    if (!activeUser) {
      alert('Cloud වෙතින් Invoices Download කිරීමට ප්‍රථමයෙන් Login වන්න.');
      return;
    }

    if (!confirm('Cloud හි ඇති සියලුම Invoices, Customers සහ Items ඔබගේ PC Hard Disc එකට Save කිරීමට අවශ්‍යද?')) {
      return;
    }

    setSyncing(true);
    setStatusMsg('Firestore වෙතින් Invoices PC Hard Disc එකට Download වෙමින්...');

    try {
      let totalDownloaded = 0;
      let lastDoc = null;
      let hasMore = true;
      const batchSize = 500;

      let activeCollection = 'customerTransactions';

      while (hasMore) {
        let q;
        if (lastDoc) {
          q = query(collection(db, activeCollection), limit(batchSize), startAfter(lastDoc));
        } else {
          q = query(collection(db, activeCollection), limit(batchSize));
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty && totalDownloaded === 0 && activeCollection === 'customerTransactions') {
          activeCollection = 'customer_transactions';
          continue;
        }

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batchData = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          batchData.push({
            id: docSnap.id,
            docId: docSnap.id,
            ...data,
            synced: 1,
          });
        });

        await localDb.invoices.bulkPut(batchData);

        totalDownloaded += batchData.length;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setStatusMsg(`PC Hard Disc එකට Save වෙමින්: Invoices ${totalDownloaded}...`);

        if (snapshot.docs.length < batchSize) {
          hasMore = false;
        }
      }

      // Sync Customers to PC Hard Disc
      try {
        const custSnap = await getDocs(collection(db, 'customers'));
        if (!custSnap.empty) {
          const custData = [];
          custSnap.forEach(d => custData.push({ id: d.id, ...d.data() }));
          await localDb.customers.bulkPut(custData);
        }
      } catch (cErr) {
        console.warn('Customers download fallback:', cErr);
      }

      // Sync Items to PC Hard Disc
      try {
        const itemSnap = await getDocs(collection(db, 'items'));
        if (!itemSnap.empty) {
          const itemData = [];
          itemSnap.forEach(d => itemData.push({ id: d.id, ...d.data() }));
          await localDb.items.bulkPut(itemData);
        }
      } catch (iErr) {
        console.warn('Items download fallback:', iErr);
      }

      setStatusMsg(`🎉 සාර්ථකයි! Invoices ${totalDownloaded} ක් PC Hard Disc එකට Save විය!`);
      alert(`🎉 Invoices ${totalDownloaded} ක් සහ Customer/Item දත්ත සියල්ල ඔබගේ PC Hard Disc එකට සාර්ථකව Save විය! දැන් Offline අවස්ථාවේදීද මේවා සියල්ල කියවිය හැක.`);
      await checkPending();
    } catch (e) {
      console.error('Download to PC error:', e);
      setStatusMsg('Download දෝෂයක්: ' + e.message);
      alert('Download දෝෂයක්: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // 3. Force Clear Stuck Unsynced Items
  const handleForceClearUnsynced = async () => {
    if (!confirm('Stuck වී ඇති නොගැලපෙන Local Data 4 සාර්ථකව Synced ලෙස Mark කර ඉවත් කිරීමට අවශ්‍යද?')) {
      return;
    }
    try {
      const pendingInvoices = await localDb.invoices
        .filter((inv) => !inv.synced || inv.synced === 0)
        .toArray();

      for (const inv of pendingInvoices) {
        await localDb.invoices.put({
          ...inv,
          synced: 1,
        });
      }
      setStatusMsg('🧹 Stuck Items සාර්ථකව Clear විය!');
      await checkPending();
    } catch (e) {
      alert('Clear error: ' + e.message);
    }
  };

  if (position.x === null || position.y === null) return null;

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
      {/* Status Tooltip Message */}
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

      {/* Sync Menu Options */}
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

      {/* Main Draggable Floating Button */}
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
          transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
        }}
      >
        <span style={{ cursor: 'grab', fontSize: '16px', opacity: 0.8 }} title="ඇද තැබීමට ක්ලික් කර අදින්න">
          ⋮⋮
        </span>
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
import { db } from '@/shared/firebase-config';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import {
  localDb,
  saveToLocal,
  getUnsyncedRecords,
  markSynced,
  getPendingSync,
  markQueueProcessed,
} from './localDb';

// ── Online/Offline check ──
export function isOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

// ── සියලුම collections ──
const ALL_COLLECTIONS = [
  'items',
  'customers',
  'suppliers',
  'invoices',
  'purchases',
  'customerLoans',
  'cashTransactions',
  'payments',
  'settings',
];

// 🔑 Internal flags — Firestore ට upload කරන්න එපා
const INTERNAL_FLAGS = [
  'synced', '_synced', '_deductedAt', '_localSaved',
  '_pendingBatchUpdates', '_savedAt',
];

/**
 * Firestore → Local (Download)
 */
export async function syncFirestoreToLocal(uid, collections = ALL_COLLECTIONS, onProgress) {
  if (!isOnline()) return { success: false, reason: 'offline' };

  let totalDownloaded = 0;

  for (const col of collections) {
    try {
      const colRef = collection(db, col);
      const q = query(colRef, where('uid', '==', uid));
      const snap = await getDocs(q);

      const table = localDb.table(col);

      const records = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        synced: true,
        _synced: true,          // 🔑 FIX 2: _synced flag එකත් set කරන්න
        _deductedAt: null,      // 🔑 Clear deduction marker
        _localSaved: false,     // 🔑 Clear local-only marker
      }));

      if (records.length > 0) {
        await table.bulkPut(records);
        totalDownloaded += records.length;
      }

      if (onProgress) {
        onProgress(`⬇️ ${col}: ${records.length} records`);
      }
    } catch (err) {
      console.error(`[sync] Firestore→Local error (${col}):`, err);
    }
  }

  return { success: true, downloaded: totalDownloaded };
}

/**
 * Local → Firestore (Upload)
 */
export async function syncLocalToFirestore(uid, collections = ALL_COLLECTIONS, onProgress) {
  if (!isOnline()) return { success: false, reason: 'offline' };

  let totalUploaded = 0;

  for (const col of collections) {
    try {
      const unsynced = await getUnsyncedRecords(col, uid);
      if (unsynced.length === 0) continue;

      const BATCH_SIZE = 400;
      for (let i = 0; i < unsynced.length; i += BATCH_SIZE) {
        const chunk = unsynced.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const record of chunk) {
          // 🔑 FIX 1: Internal flags ඔක්කොම remove කරන්න
          const dataToUpload = {};
          for (const [key, value] of Object.entries(record)) {
            if (!INTERNAL_FLAGS.includes(key)) {
              dataToUpload[key] = value;
            }
          }

          // Firestore Timestamp convert
          if (dataToUpload.createdAt && typeof dataToUpload.createdAt === 'string') {
            dataToUpload.createdAt = Timestamp.fromDate(new Date(dataToUpload.createdAt));
          }
          if (dataToUpload.updatedAt && typeof dataToUpload.updatedAt === 'string') {
            dataToUpload.updatedAt = Timestamp.fromDate(new Date(dataToUpload.updatedAt));
          }
          if (dataToUpload.date && typeof dataToUpload.date === 'string') {
            dataToUpload.date = Timestamp.fromDate(new Date(dataToUpload.date));
          }

          const docRef = doc(db, col, record.id);
          batch.set(docRef, dataToUpload, { merge: true });
        }

        await batch.commit();

        // 🔑 FIX 3: Bulk update synced flags (faster)
        try {
          const table = localDb.table(col);
          for (const record of chunk) {
            await table.update(record.id, {
              synced: true,
              _synced: true,
              _deductedAt: null,
              _localSaved: false,
            });
          }
        } catch (markErr) {
          // Fallback: individual markSynced
          for (const record of chunk) {
            try { await markSynced(col, record.id); } catch {}
          }
        }

        totalUploaded += chunk.length;
      }

      if (onProgress) {
        onProgress(`⬆️ ${col}: ${unsynced.length} records`);
      }
    } catch (err) {
      console.error(`[sync] Local→Firestore error (${col}):`, err);
    }
  }

  return { success: true, uploaded: totalUploaded };
}

/**
 * Sync Queue Process
 */
export async function processSyncQueue(uid, onProgress) {
  if (!isOnline()) return { success: false, reason: 'offline' };

  const pending = await getPendingSync(uid);
  if (pending.length === 0) return { success: true, processed: 0 };

  let count = 0;

  for (const item of pending) {
    try {
      if (item.operation === 'delete' && item.collection && item.docId) {
        await deleteDoc(doc(db, item.collection, item.docId));
      } else if ((item.operation === 'create' || item.operation === 'update') && item.collection && item.docId) {
        // 🔑 FIX 1: Internal flags remove
        const data = {};
        for (const [key, value] of Object.entries(item.data || {})) {
          if (!INTERNAL_FLAGS.includes(key)) {
            data[key] = value;
          }
        }
        await setDoc(doc(db, item.collection, item.docId), data, { merge: true });
      }

      await markQueueProcessed(item.id);
      count++;
    } catch (err) {
      console.error(`[sync] Queue process error:`, err);
    }
  }

  if (onProgress) {
    onProgress(`🔄 Queue: ${count} operations processed`);
  }

  return { success: true, processed: count };
}

/**
 * Full Bi-Directional Sync
 * 1. Queue process (deletes etc.)
 * 2. Local → Firestore (upload)
 * 3. Firestore → Local (download)
 */
export async function fullSync(uid, onProgress) {
  if (!isOnline()) return { success: false, reason: 'offline' };

  try {
    if (onProgress) onProgress('🔄 Sync ආරම්භ කරමින්...');

    const queueResult = await processSyncQueue(uid, onProgress);

    if (onProgress) onProgress('⬆️ Upload කරමින්...');
    const uploadResult = await syncLocalToFirestore(uid, ALL_COLLECTIONS, onProgress);

    if (onProgress) onProgress('⬇️ Download කරමින්...');
    const downloadResult = await syncFirestoreToLocal(uid, ALL_COLLECTIONS, onProgress);

    if (onProgress) {
      onProgress(
        `✅ Sync සම්පූර්ණයි! ⬆️${uploadResult.uploaded || 0} ⬇️${downloadResult.downloaded || 0}`
      );
    }

    return {
      success: true,
      uploaded: uploadResult.uploaded || 0,
      downloaded: downloadResult.downloaded || 0,
      queueProcessed: queueResult.processed || 0,
    };
  } catch (err) {
    console.error('[sync] fullSync error:', err);
    if (onProgress) onProgress(`❌ Sync error: ${err.message}`);
    return { success: false, error: err.message };
  }
}
// lib/syncManager.js
import { db } from '@/lib/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore';
import {
  getSyncQueue, removeFromSyncQueue,
  saveItemLocal, deleteItemLocal,
} from './offlineDB';

let isSyncing = false;

export async function processSyncQueue(uid, onProgress) {
  if (isSyncing || !navigator.onLine) return;
  isSyncing = true;

  try {
    const queue = await getSyncQueue(uid);
    if (queue.length === 0) { isSyncing = false; return; }

    onProgress?.({ total: queue.length, done: 0, status: 'syncing' });

    // Sort by timestamp (oldest first)
    queue.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      try {
        if (entry.operation === 'add') {
          const { localId, firestoreId, _offlineSaved, _savedAt, ...data } = entry.data;
          const docRef = await addDoc(collection(db, entry.collection), {
            ...data,
            uid,
            createdAt: data.createdAt || new Date().toISOString(),
          });
          // Update local record with real Firestore ID
          if (localId) {
            await saveItemLocal(uid, entry.data, docRef.id);
            await deleteItemLocal(localId);
          }
        } else if (entry.operation === 'update' && entry.docId) {
          const { localId, firestoreId, _offlineSaved, _savedAt, ...data } = entry.data;
          await updateDoc(doc(db, entry.collection, entry.docId), {
            ...data,
            updatedAt: new Date().toISOString(),
          });
        } else if (entry.operation === 'delete' && entry.docId) {
          await deleteDoc(doc(db, entry.collection, entry.docId));
        }

        await removeFromSyncQueue(entry.id);
        onProgress?.({ total: queue.length, done: i + 1, status: 'syncing' });
      } catch (err) {
        console.error(`Sync failed for entry ${entry.id}:`, err);
        // Skip and try next — will retry on next sync
      }
    }

    onProgress?.({ total: queue.length, done: queue.length, status: 'done' });
  } catch (err) {
    console.error('Sync queue processing error:', err);
    onProgress?.({ total: 0, done: 0, status: 'error' });
  } finally {
    isSyncing = false;
  }
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
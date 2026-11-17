// lib/offlineQueue.js
// ✅ Internet නැති වෙලාවට invoices local queue එකේ save කරනවා
// ✅ Internet ආපහෝ ආවාම auto-sync වෙනවා

const QUEUE_KEY = 'weerakkodi_offline_invoice_queue';

/**
 * Invoice එකක් offline queue එකට දානවා
 */
export function queueInvoiceOffline(invoiceData, invoiceId, uid) {
  try {
    const queue = getQueue();
    queue.push({
      id: invoiceId,
      uid: uid,
      data: invoiceData,
      timestamp: Date.now(),
      action: 'save'
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log(`[Offline Queue] ✅ Invoice ${invoiceId} queued. Total: ${queue.length}`);
    return true;
  } catch (err) {
    console.error('[Offline Queue] ❌ Failed to queue:', err);
    return false;
  }
}

/**
 * Queue එකේ තියෙන invoices return කරනවා
 */
export function getQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Queue count return කරනවා (UI එකේ පෙන්නන්න)
 */
export function getQueueCount() {
  return getQueue().length;
}

/**
 * Queue එකේ තියෙන invoices Firestore එකට sync කරනවා
 */
export async function syncOfflineQueue(db) {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[Offline Queue] ⏳ Still offline, skipping sync');
    return 0;
  }

  const { doc, setDoc } = await import('firebase/firestore');
  let synced = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const ref = doc(db, 'users', item.uid, 'invoices', item.id);
      await setDoc(ref, item.data, { merge: true });
      synced++;
      console.log(`[Offline Queue] ✅ Synced invoice ${item.id}`);
    } catch (err) {
      console.warn(`[Offline Queue] ⚠️ Failed to sync ${item.id}:`, err.message);
      remaining.push(item);
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  console.log(`[Offline Queue] Synced ${synced}/${queue.length}. Remaining: ${remaining.length}`);
  return synced;
}

/**
 * Queue එක clear කරනවා
 */
export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}
// fix_pos.js
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Weerakkodi POS Auto-Repair...');

// 1. FIX POSInvoice.jsx
const posFiles = [
  path.join(__dirname, 'components', 'POSInvoice.jsx'),
  path.join(__dirname, 'src', 'components', 'POSInvoice.jsx')
];

posFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  console.log('🔧 Cleaning headers in:', file);
  let code = fs.readFileSync(file, 'utf8');

  // Remove existing 'use client' and duplicate Dexie/sync imports
  code = code.replace(/['"]use client['"];?\r?\n/g, '');
  code = code.replace(/^import\s+localDb.*?;?\r?\n/gm, '');
  code = code.replace(/^import\s*\{[^}]*localDb[^}]*\}\s*from.*?;?\r?\n/gm, '');
  code = code.replace(/^import\s*\{[^}]*saveInvoiceOfflineFirst[^}]*\}\s*from.*?;?\r?\n/gm, '');
  code = code.replace(/^import\s*\{[^}]*syncPendingInvoices[^}]*\}\s*from.*?;?\r?\n/gm, '');

  const cleanHeader = `'use client';\n\nimport { localDb } from '@/lib/localDb';\nimport { saveInvoiceOfflineFirst, syncPendingInvoices } from '@/lib/syncService';\n`;
  code = cleanHeader + code.trimStart();
  fs.writeFileSync(file, code, 'utf8');
  console.log('✅ POSInvoice.jsx updated.');
});

// 2. CREATE lib/syncService.js & src/lib/syncService.js
const syncServiceCode = `// lib/syncService.js - Offline-first Sync Service
import { localDb } from './localDb';
import { db } from '../firebaseConfig';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

export async function saveInvoiceOfflineFirst(invoiceData, user = null) {
  const localId = invoiceData.localId || invoiceData.id || ('INV_LOC_' + Date.now());
  const invoiceRecord = {
    ...invoiceData,
    id: localId,
    localId: localId,
    synced: false,
    createdAt: invoiceData.createdAt || new Date().toISOString(),
    date: invoiceData.date || new Date().toISOString().split('T')[0]
  };

  // 1. Save to Dexie local invoices table
  try {
    if (localDb && localDb.invoices) {
      await localDb.invoices.put(invoiceRecord);
    }
  } catch (err) {
    console.warn('Dexie invoice write warning:', err);
  }

  // 2. Reduce local inventory stock in Dexie immediately
  try {
    if (localDb && localDb.items && Array.isArray(invoiceData.items)) {
      for (const it of invoiceData.items) {
        const targetId = it.id || it.itemId;
        if (!targetId) continue;
        const current = await localDb.items.get(targetId);
        if (current) {
          const qty = Number(it.quantity || it.qty || 1);
          const newStock = Math.max(0, (Number(current.stock || current.quantity || 0)) - qty);
          await localDb.items.update(targetId, { stock: newStock, quantity: newStock });
        }
      }
    }
  } catch (stockErr) {
    console.warn('Dexie stock reduction warning:', stockErr);
  }

  // 3. Update customer outstanding balance in Dexie (Credit Sales)
  try {
    if (localDb && localDb.customers && invoiceData.customerId && Number(invoiceData.dueAmount || 0) > 0) {
      const cust = await localDb.customers.get(invoiceData.customerId);
      if (cust) {
        const curBal = Number(cust.balance || 0);
        const addedDue = Number(invoiceData.dueAmount || 0);
        await localDb.customers.update(invoiceData.customerId, { balance: curBal + addedDue });
      }
    }
  } catch (custErr) {
    console.warn('Dexie customer balance update warning:', custErr);
  }

  // 4. Save JSON backup directly to Hard Disk via Electron IPC
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.saveLocalData) {
      const todayStr = invoiceRecord.date || new Date().toISOString().split('T')[0];
      const backupPath = localStorage.getItem('pos_backup_path') || 'D:\\\\Weerakkodi_POS_Backups';
      await window.electronAPI.saveLocalData(backupPath, 'sales_' + todayStr + '.json', invoiceRecord);
    }
  } catch (fileErr) {
    console.warn('HDD JSON backup write warning:', fileErr);
  }

  // 5. Cloud Firestore background sync with non-blocking timeout
  if (typeof navigator !== 'undefined' && navigator.onLine && db) {
    try {
      const syncPromise = (async () => {
        const invoiceRef = doc(collection(db, 'invoices'), localId);
        await setDoc(invoiceRef, {
          ...invoiceRecord,
          synced: true,
          syncedAt: serverTimestamp()
        }, { merge: true });

        if (localDb && localDb.invoices) {
          await localDb.invoices.update(localId, { synced: true });
        }
      })();

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2500));
      Promise.race([syncPromise, timeoutPromise]).catch(() => {});
    } catch (e) {
      console.log('Cloud sync scheduled for later');
    }
  }

  return { success: true, localId: localId, invoice: invoiceRecord };
}

export async function syncPendingInvoices(user = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: false, syncedCount: 0 };
  try {
    if (!localDb || !localDb.invoices || !db) return { success: false, syncedCount: 0 };
    const unSynced = await localDb.invoices.filter(inv => !inv.synced).toArray();
    if (!unSynced || unSynced.length === 0) return { success: true, syncedCount: 0 };

    let count = 0;
    for (const inv of unSynced) {
      try {
        const invoiceRef = doc(collection(db, 'invoices'), inv.localId || inv.id);
        await setDoc(invoiceRef, {
          ...inv,
          synced: true,
          syncedAt: serverTimestamp()
        }, { merge: true });

        await localDb.invoices.update(inv.id, { synced: true });
        count++;
      } catch (err) {
        console.warn('Sync pending invoice err:', err);
      }
    }
    return { success: true, syncedCount: count };
  } catch (err) {
    return { success: false, error: err };
  }
}

export default { saveInvoiceOfflineFirst, syncPendingInvoices };
`;

['lib', 'src/lib'].forEach(dir => {
  const fullDir = path.join(__dirname, dir);
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, 'syncService.js'), syncServiceCode, 'utf8');
});
console.log('✅ syncService.js created in lib/ & src/lib/');

// 3. CREATE lib/userBackupService.js & src/lib/userBackupService.js
const userBackupCode = `// lib/userBackupService.js
import { localDb } from './localDb';

export async function backupUserData(userId) {
  try {
    const items = localDb && localDb.items ? await localDb.items.toArray() : [];
    const customers = localDb && localDb.customers ? await localDb.customers.toArray() : [];
    const invoices = localDb && localDb.invoices ? await localDb.invoices.toArray() : [];

    const payload = {
      userId,
      timestamp: new Date().toISOString(),
      items,
      customers,
      invoices
    };

    if (typeof window !== 'undefined' && window.electronAPI?.saveLocalData) {
      const backupPath = localStorage.getItem('pos_backup_path') || 'D:\\\\Weerakkodi_POS_Backups';
      await window.electronAPI.saveLocalData(backupPath, 'user_backup_' + (userId || 'pos') + '.json', payload);
    }
    return { success: true, data: payload };
  } catch (error) {
    return { success: false, error };
  }
}

export async function restoreUserData(backupData) {
  try {
    if (!backupData || !localDb) return { success: false };
    if (backupData.items && Array.isArray(backupData.items) && localDb.items) {
      await localDb.items.bulkPut(backupData.items);
    }
    if (backupData.customers && Array.isArray(backupData.customers) && localDb.customers) {
      await localDb.customers.bulkPut(backupData.customers);
    }
    if (backupData.invoices && Array.isArray(backupData.invoices) && localDb.invoices) {
      await localDb.invoices.bulkPut(backupData.invoices);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

export default { backupUserData, restoreUserData };
`;

['lib', 'src/lib'].forEach(dir => {
  const fullDir = path.join(__dirname, dir);
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, 'userBackupService.js'), userBackupCode, 'utf8');
});
console.log('✅ userBackupService.js created in lib/ & src/lib/');

// 4. CREATE PfiItemClient.jsx
const pfiDirs = [
  path.join(__dirname, 'app', 'pfi', '[shopId]', 'item', '[itemId]'),
  path.join(__dirname, 'src', 'app', 'pfi', '[shopId]', 'item', '[itemId]')
];

const pfiClientCode = `'use client';

import React from 'react';
import { useParams } from 'next/navigation';

export default function PfiItemClient({ initialData = null }) {
  const params = useParams();
  const shopId = params?.shopId || 'shop';
  const itemId = params?.itemId || 'item';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
        <h1 className="text-2xl font-bold text-amber-400 mb-2">PFI Item View</h1>
        <p className="text-slate-400 text-sm mb-4">Shop: {shopId} | Item: {itemId}</p>
        <div className="bg-slate-950 p-4 rounded-xl text-left font-mono text-xs text-emerald-400 overflow-x-auto">
          {initialData ? JSON.stringify(initialData, null, 2) : 'Offline Item Profile Ready'}
        </div>
      </div>
    </div>
  );
}
`;

pfiDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.writeFileSync(path.join(dir, 'PfiItemClient.jsx'), pfiClientCode, 'utf8');
    fs.writeFileSync(path.join(dir, 'PfiItemClient.js'), pfiClientCode, 'utf8');
    console.log('✅ PfiItemClient created in:', dir);
  }
});

// 5. UNIFIED DEXIE DB DEFINITIONS
const dexieCode = `import Dexie from 'dexie';

export const localDb = new Dexie('WeerakkodiPOS_LocalDB');

localDb.version(1).stores({
  items: 'id, name, itemCode, barcode, uid, stock, quantity',
  customers: 'id, name, phone, uid, balance',
  invoices: 'id, invoiceNo, localId, synced, createdAt, date',
  drafts: 'id, invoiceNo, localId, createdAt'
});

export const db = localDb;
export const dexieDb = localDb;
export default localDb;
`;

['lib', 'src/lib'].forEach(dir => {
  const fullDir = path.join(__dirname, dir);
  ['localDb.js', 'dexieDb.js', 'dexieDB.js', 'dexie.js'].forEach(fileName => {
    fs.writeFileSync(path.join(fullDir, fileName), dexieCode, 'utf8');
  });
});
console.log('✅ Dexie database definitions synchronized.');

console.log('🎉 All repairs completed successfully!');
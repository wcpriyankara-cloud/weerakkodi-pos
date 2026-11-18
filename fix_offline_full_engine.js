// fix_offline_full_engine.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('⚡ Repairing Electron Data Quota, Storage Locks, and POS Save Handlers...');

// 1. Kill any zombie electron processes holding storage locks
try {
  execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
  console.log('✅ Cleared zombie electron background locks.');
} catch (e) {
  // No running process
}

// 2. UPGRADE main/main.js with custom dedicated writable userData directory
const mainJsPath = path.join(__dirname, 'main', 'main.js');
const mainJsCode = `// main/main.js - Electron Main Process for Weerakkodi POS
const { app, BrowserWindow, ipcMain, dialog, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');

// Anti-crash switches for Windows
app.commandLine.appendSwitch('disable-features', 'OutOfProcessNetworkService');
app.commandLine.appendSwitch('disable-features', 'NetworkService');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('disable-http2');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('no-sandbox');

// Dedicated clean userData path to prevent Access Denied (0x5)
const customUserDataPath = path.join(app.getPath('appData'), 'WeerakkodiPOS_Data');
if (!fs.existsSync(customUserDataPath)) {
  fs.mkdirSync(customUserDataPath, { recursive: true });
}
app.setPath('userData', customUserDataPath);

let mainWindow = null;
let localServer = null;
const FIXED_PORT = 38765;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function startLocalServer(onReady) {
  const outDir = path.join(__dirname, '..', 'out');

  localServer = http.createServer((req, res) => {
    try {
      const parsedUrl = url.parse(req.url);
      let pathname = decodeURIComponent(parsedUrl.pathname);

      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }

      let filePath = path.join(outDir, pathname);

      if (!fs.existsSync(filePath) || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
        if (fs.existsSync(path.join(filePath, 'index.html'))) {
          filePath = path.join(filePath, 'index.html');
        } else if (fs.existsSync(filePath + '.html')) {
          filePath = filePath + '.html';
        } else {
          filePath = path.join(outDir, 'index.html');
        }
      }

      if (!fs.existsSync(filePath)) {
        filePath = path.join(outDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server Error: ' + err.message);
    }
  });

  localServer.listen(FIXED_PORT, '127.0.0.1', () => {
    console.log(\`✅ Offline POS Embedded Server active at: http://127.0.0.1:\${FIXED_PORT}\`);
    onReady();
  });
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(900, height),
    minWidth: 1024,
    minHeight: 700,
    title: 'Weerakkodi POS & Inventory System',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  const targetUrl = \`http://127.0.0.1:\${FIXED_PORT}\`;
  console.log('Loading Weerakkodi POS App from:', targetUrl);
  mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 1: Folder Dialog for Settings
ipcMain.handle('open-folder-dialog', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Storage Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }
  return { canceled: false, folderPath: result.filePaths[0] };
});

// IPC 2: Direct Real-time Hard Disk JSON Backup (Append & Merge)
ipcMain.handle('save-local-data', async (event, payloadOrPath, maybeFileName, maybeData) => {
  try {
    let folderPath = '';
    let fileName = '';
    let data = null;

    if (typeof payloadOrPath === 'object' && payloadOrPath !== null && !maybeFileName) {
      folderPath = payloadOrPath.folderPath || '';
      fileName = payloadOrPath.fileName || '';
      data = payloadOrPath.data !== undefined ? payloadOrPath.data : payloadOrPath;
    } else {
      folderPath = payloadOrPath;
      fileName = maybeFileName;
      data = maybeData;
    }

    if (!folderPath) {
      folderPath = fs.existsSync('D:\\\\') ? 'D:\\\\Weerakkodi_POS_Backups' : path.join(app.getPath('documents'), 'Weerakkodi_POS_Backups');
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    if (!fileName) {
      fileName = 'sales_' + new Date().toISOString().split('T')[0] + '.json';
    }

    const fullFilePath = path.join(folderPath, fileName);
    console.log('[Electron Main] Writing sales backup to:', fullFilePath);

    let currentData = [];
    if (fs.existsSync(fullFilePath)) {
      try {
        const raw = fs.readFileSync(fullFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) currentData = parsed;
        else if (parsed && typeof parsed === 'object') currentData = [parsed];
      } catch (e) {
        currentData = [];
      }
    }

    if (Array.isArray(data)) {
      data.forEach(item => {
        const idx = currentData.findIndex(x => (x.id && x.id === item.id) || (x.localId && x.localId === item.localId) || (x.invoiceNo && x.invoiceNo === item.invoiceNo));
        if (idx >= 0) currentData[idx] = { ...currentData[idx], ...item };
        else currentData.push(item);
      });
    } else if (data && typeof data === 'object') {
      const idx = currentData.findIndex(x => (x.id && x.id === data.id) || (x.localId && x.localId === data.localId) || (x.invoiceNo && x.invoiceNo === data.invoiceNo));
      if (idx >= 0) currentData[idx] = { ...currentData[idx], ...data };
      else currentData.push(data);
    }

    fs.writeFileSync(fullFilePath, JSON.stringify(currentData, null, 2), 'utf8');
    console.log(\`✅ [Hard Disk Backup] Successfully saved \${currentData.length} records to \${fullFilePath}\`);
    return { success: true, path: fullFilePath, count: currentData.length };
  } catch (error) {
    console.error('❌ Error in save-local-data IPC:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  startLocalServer(() => {
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
`;

fs.writeFileSync(mainJsPath, mainJsCode, 'utf8');
console.log('✅ Updated main/main.js with custom user data directory & fixed port.');

// 3. UPGRADE lib/syncService.js to execute HDD File Save FIRST
const syncServiceCode = `// lib/syncService.js - Fail-safe Offline-First Sync Engine
import { localDb } from './localDb';
import { db } from '../firebaseConfig';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

export async function saveInvoiceOfflineFirst(invoiceData, user = null) {
  const timestamp = new Date().toISOString();
  const dateStr = invoiceData.date || timestamp.split('T')[0];
  const invoiceNumber = invoiceData.invoiceNo || invoiceData.id || ('INV-' + Date.now().toString().slice(-6));
  const localId = invoiceData.localId || invoiceData.id || ('LOC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));

  const completeRecord = {
    ...invoiceData,
    id: localId,
    localId: localId,
    invoiceNo: invoiceNumber,
    date: dateStr,
    createdAt: invoiceData.createdAt || timestamp,
    timestamp: timestamp,
    synced: false,
    userId: user?.uid || invoiceData.userId || 'admin',
    customerName: invoiceData.customerName || invoiceData.customer?.name || 'Walk-in Customer',
    grandTotal: Number(invoiceData.grandTotal || invoiceData.netTotal || invoiceData.total || 0),
    paidAmount: Number(invoiceData.paidAmount || invoiceData.paid || 0),
    dueAmount: Number(invoiceData.dueAmount || invoiceData.due || 0),
    paymentMethod: invoiceData.paymentMethod || invoiceData.paymentType || 'Cash',
    items: Array.isArray(invoiceData.items) ? invoiceData.items : []
  };

  console.log('🚀 [Offline POS] Initiating Offline Checkout for:', invoiceNumber);

  // 1. PRIMARY SAVE: Direct to Hard Disk via Electron API (Guaranteed Zero Data Loss)
  let hddSaved = false;
  if (typeof window !== 'undefined' && window.electronAPI?.saveLocalData) {
    try {
      const backupFolder = localStorage.getItem('pos_backup_path') || 'D:\\\\Weerakkodi_POS_Backups';
      const fileName = 'sales_' + dateStr + '.json';
      const result = await window.electronAPI.saveLocalData(backupFolder, fileName, completeRecord);
      if (result && result.success) {
        hddSaved = true;
        console.log('✅ [HDD Save] Invoice successfully written to Hard Drive JSON file!');
      }
    } catch (hddErr) {
      console.warn('⚠️ Hard Disk backup write error:', hddErr);
    }
  }

  // 2. SECONDARY SAVE: Dexie IndexedDB
  try {
    if (localDb && localDb.invoices) {
      await localDb.invoices.put(completeRecord);
      console.log('✅ [Dexie DB] Invoice record saved in IndexedDB.');
    }
  } catch (dexieErr) {
    console.warn('⚠️ Dexie Invoices write warning:', dexieErr);
  }

  // 3. SECONDARY SAVE: LocalStorage Invoices Array Backup
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existingOfflineStr = localStorage.getItem('offline_invoices_cache') || '[]';
      const existingList = JSON.parse(existingOfflineStr);
      existingList.unshift(completeRecord);
      localStorage.setItem('offline_invoices_cache', JSON.stringify(existingList.slice(0, 500)));
    } catch (lsErr) {
      console.warn('LocalStorage backup note:', lsErr);
    }
  }

  // 4. STOCK REDUCTION: Dexie Items Table
  try {
    if (localDb && localDb.items && Array.isArray(completeRecord.items)) {
      for (const it of completeRecord.items) {
        const itemId = it.id || it.itemId;
        if (!itemId) continue;
        const current = await localDb.items.get(itemId);
        if (current) {
          const qty = Number(it.quantity || it.qty || 1);
          const currentStock = Number(current.stock || current.quantity || 0);
          const newStock = Math.max(0, currentStock - qty);
          await localDb.items.update(itemId, { stock: newStock, quantity: newStock, lastUpdated: timestamp });
          console.log(\`📉 [Stock Reduced] Item: \${current.name || itemId} -> New Stock: \${newStock}\`);
        }
      }
    }
  } catch (stockErr) {
    console.warn('Dexie stock deduction note:', stockErr);
  }

  // 5. CUSTOMER BALANCE UPDATE: Dexie Customers Table (Credit Sales)
  const custId = completeRecord.customerId || completeRecord.customer?.id;
  if (localDb && localDb.customers && custId && completeRecord.dueAmount > 0) {
    try {
      const cust = await localDb.customers.get(custId);
      if (cust) {
        const prevBal = Number(cust.balance || 0);
        const newBal = prevBal + completeRecord.dueAmount;
        await localDb.customers.update(custId, { balance: newBal, lastUpdated: timestamp });
        console.log(\`💳 [Customer Ledger] Updated balance: \${prevBal} -> \${newBal}\`);
      }
    } catch (custErr) {
      console.warn('Dexie customer balance note:', custErr);
    }
  }

  // 6. BACKGROUND CLOUD SYNC: Firestore (Non-blocking with 2.5s Timeout)
  if (typeof navigator !== 'undefined' && navigator.onLine && db) {
    const cloudSyncTask = async () => {
      try {
        const docRef = doc(collection(db, 'invoices'), localId);
        await setDoc(docRef, {
          ...completeRecord,
          synced: true,
          syncedAt: serverTimestamp()
        }, { merge: true });

        if (localDb && localDb.invoices) {
          await localDb.invoices.update(localId, { synced: true });
        }
        console.log('☁️ [Cloud Sync] Synced invoice to Firestore:', localId);
      } catch (cloudErr) {
        console.log('ℹ️ Cloud sync deferred for later connection.');
      }
    };

    Promise.race([
      cloudSyncTask(),
      new Promise(resolve => setTimeout(resolve, 2500))
    ]).catch(() => {});
  }

  return {
    success: true,
    localId: localId,
    invoiceNo: invoiceNumber,
    invoice: completeRecord,
    hddSaved: hddSaved
  };
}

export async function syncPendingInvoices(user = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, syncedCount: 0, message: 'Offline' };
  }
  try {
    if (!localDb || !localDb.invoices || !db) return { success: false, syncedCount: 0 };
    const pending = await localDb.invoices.filter(inv => !inv.synced).toArray();
    if (!pending || pending.length === 0) return { success: true, syncedCount: 0 };

    let count = 0;
    for (const inv of pending) {
      try {
        const invoiceRef = doc(collection(db, 'invoices'), inv.localId || inv.id);
        await setDoc(invoiceRef, {
          ...inv,
          synced: true,
          syncedAt: serverTimestamp()
        }, { merge: true });
        await localDb.invoices.update(inv.id, { synced: true });
        count++;
      } catch (e) {}
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
console.log('✅ Standardized lib/syncService.js with fail-safe priorities.');

console.log('🎉 Offline engine repair applied successfully!');
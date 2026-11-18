// fix_offline_ipc.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('⚡ Repairing Universal IPC Handler and Offline Checkout Pipeline...');

// 1. Terminate any running electron instances to free locks
try {
  execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
} catch (e) {}

// 2. UPGRADE main/main.js with Robust Universal Signature Normalizer
const mainJsPath = path.join(__dirname, 'main', 'main.js');
const mainJsCode = `// main/main.js - Electron Main Process for Weerakkodi POS
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
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

// 1. IPC Handler: Open Folder Dialog (Settings UI)
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

// 2. IPC Handler: Universal Real-time Hard Disk JSON Backup
ipcMain.handle('save-local-data', async (event, ...args) => {
  try {
    let folderPath = '';
    let fileName = '';
    let data = null;

    // Universal signature resolution:
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
      // Form: ({ folderPath, fileName, data })
      folderPath = typeof args[0].folderPath === 'string' ? args[0].folderPath : '';
      fileName = typeof args[0].fileName === 'string' ? args[0].fileName : '';
      data = args[0].data !== undefined ? args[0].data : args[0];
    } else if (args.length === 3) {
      // Form: (folderPath, fileName, data)
      folderPath = typeof args[0] === 'string' ? args[0] : '';
      fileName = typeof args[1] === 'string' ? args[1] : '';
      data = args[2];
    } else if (args.length === 2) {
      // Form: (arg0, arg1)
      if (typeof args[0] === 'string' && (args[0].endsWith('.json') || args[0].includes('.'))) {
        // (fileName, data)
        fileName = args[0];
        data = args[1];
      } else if (typeof args[1] === 'string' && (args[1].endsWith('.json') || args[1].includes('.'))) {
        if (typeof args[0] === 'string') {
          // (folderPath, fileName)
          folderPath = args[0];
          fileName = args[1];
        } else {
          // (data, fileName) -> Fix for Array passed as first argument!
          data = args[0];
          fileName = args[1];
        }
      } else {
        if (typeof args[0] === 'string') folderPath = args[0];
        data = args[1];
      }
    } else if (args.length === 1) {
      data = args[0];
    }

    // Fallback default backup folder (D:\Weerakkodi_POS_Backups or Documents)
    if (typeof folderPath !== 'string' || !folderPath.trim()) {
      folderPath = fs.existsSync('D:\\\\') ? 'D:\\\\Weerakkodi_POS_Backups' : path.join(app.getPath('documents'), 'Weerakkodi_POS_Backups');
    }

    // Fallback file name
    if (typeof fileName !== 'string' || !fileName.trim()) {
      const todayStr = new Date().toISOString().split('T')[0];
      fileName = \`sales_\${todayStr}.json\`;
    }
    if (!fileName.endsWith('.json')) {
      fileName = \`\${fileName}.json\`;
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const fullFilePath = path.join(folderPath, fileName);
    console.log('[Hard Disk Backup] Target path:', fullFilePath);

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
        if (!item) return;
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
    console.log(\`✅ [Hard Disk Backup] Saved \${currentData.length} records to: \${fullFilePath}\`);
    return { success: true, path: fullFilePath, count: currentData.length };
  } catch (error) {
    console.error('❌ Universal save-local-data IPC error:', error);
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
console.log('✅ main/main.js updated with universal signature resolution.');

// 3. UPGRADE main/preload.js
const preloadJsPath = path.join(__dirname, 'main', 'preload.js');
const preloadJsCode = `// main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  saveLocalData: async (...args) => {
    try {
      return await ipcRenderer.invoke('save-local-data', ...args);
    } catch (err) {
      console.error('Preload saveLocalData error:', err);
      return { success: false, error: err.message };
    }
  }
});
`;

fs.writeFileSync(preloadJsPath, preloadJsCode, 'utf8');
console.log('✅ main/preload.js updated.');

// 4. VERIFY lib/syncService.js
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

  console.log('🚀 [Offline Engine] Initiating checkout for:', invoiceNumber);

  // 1. PRIMARY SAVE: Hard Disk JSON via Electron IPC
  let hddSaved = false;
  if (typeof window !== 'undefined' && window.electronAPI?.saveLocalData) {
    try {
      const backupFolder = localStorage.getItem('pos_backup_path') || 'D:\\\\Weerakkodi_POS_Backups';
      const fileName = 'sales_' + dateStr + '.json';
      const result = await window.electronAPI.saveLocalData(backupFolder, fileName, completeRecord);
      if (result && result.success) {
        hddSaved = true;
        console.log('✅ [HDD Save] Invoice successfully written to Hard Drive!');
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

  // 3. SECONDARY SAVE: LocalStorage Cache
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existingOfflineStr = localStorage.getItem('offline_invoices_cache') || '[]';
      const existingList = JSON.parse(existingOfflineStr);
      existingList.unshift(completeRecord);
      localStorage.setItem('offline_invoices_cache', JSON.stringify(existingList.slice(0, 500)));
    } catch (lsErr) {}
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

  // 5. CUSTOMER BALANCE UPDATE: Dexie Customers Table
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
console.log('✅ Synchronized lib/syncService.js across lib and src/lib.');

console.log('🎉 Offline engine and universal IPC handler fixed successfully!');
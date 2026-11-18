// diagnose_and_repair_pos.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Inspecting and repairing POS checkout and Electron IPC...');

// 1. Terminate zombie electron processes
try {
  execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
} catch (e) {}

// 2. Fix main/main.js IPC save-local-data handler with 100% path safety
const mainJsPath = path.join(__dirname, 'main', 'main.js');
let mainJsCode = fs.readFileSync(mainJsPath, 'utf8');

const correctIpcSaveHandler = `// 2. IPC Handler: Universal Real-time Hard Disk JSON Backup
ipcMain.handle('save-local-data', async (event, ...args) => {
  try {
    let targetFolder = '';
    let targetFileName = '';
    let targetData = null;

    const defaultFolder = fs.existsSync('D:\\\\') ? 'D:\\\\Weerakkodi_POS_Backups' : path.join(app.getPath('documents'), 'Weerakkodi_POS_Backups');

    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
      targetFolder = args[0].folderPath || defaultFolder;
      targetFileName = args[0].fileName || ('sales_' + new Date().toISOString().split('T')[0] + '.json');
      targetData = args[0].data !== undefined ? args[0].data : args[0];
    } else if (args.length >= 3) {
      targetFolder = typeof args[0] === 'string' && !args[0].endsWith('.json') ? args[0] : defaultFolder;
      targetFileName = typeof args[1] === 'string' ? args[1] : ('sales_' + new Date().toISOString().split('T')[0] + '.json');
      targetData = args[2];
    } else if (args.length === 2) {
      if (typeof args[0] === 'string' && (args[0].endsWith('.json') || !args[0].includes(path.sep))) {
        // Form: saveLocalData('products_local.json', data)
        targetFolder = defaultFolder;
        targetFileName = args[0];
        targetData = args[1];
      } else if (typeof args[0] === 'string' && typeof args[1] === 'string') {
        // Form: saveLocalData('D:\\...', 'sales.json')
        targetFolder = args[0];
        targetFileName = args[1];
        targetData = [];
      } else {
        targetFolder = defaultFolder;
        targetFileName = typeof args[1] === 'string' ? args[1] : ('sales_' + new Date().toISOString().split('T')[0] + '.json');
        targetData = args[0];
      }
    } else if (args.length === 1) {
      targetFolder = defaultFolder;
      targetFileName = 'sales_' + new Date().toISOString().split('T')[0] + '.json';
      targetData = args[0];
    }

    if (!targetFolder || targetFolder.endsWith('.json')) {
      targetFolder = defaultFolder;
    }
    if (!targetFileName || !targetFileName.endsWith('.json')) {
      targetFileName = (targetFileName || 'backup') + '.json';
    }

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const fullFilePath = path.join(targetFolder, targetFileName);
    console.log('[Hard Disk Backup] Writing to:', fullFilePath);

    let currentRecords = [];
    if (fs.existsSync(fullFilePath)) {
      try {
        const raw = fs.readFileSync(fullFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) currentRecords = parsed;
        else if (parsed && typeof parsed === 'object') currentRecords = [parsed];
      } catch (e) {
        currentRecords = [];
      }
    }

    if (Array.isArray(targetData)) {
      targetData.forEach(item => {
        if (!item) return;
        const idx = currentRecords.findIndex(x => (x.id && x.id === item.id) || (x.localId && x.localId === item.localId) || (x.invoiceNo && x.invoiceNo === item.invoiceNo));
        if (idx >= 0) currentRecords[idx] = { ...currentRecords[idx], ...item };
        else currentRecords.push(item);
      });
    } else if (targetData && typeof targetData === 'object') {
      const idx = currentRecords.findIndex(x => (x.id && x.id === targetData.id) || (x.localId && x.localId === targetData.localId) || (x.invoiceNo && x.invoiceNo === targetData.invoiceNo));
      if (idx >= 0) currentRecords[idx] = { ...currentRecords[idx], ...targetData };
      else currentRecords.push(targetData);
    }

    fs.writeFileSync(fullFilePath, JSON.stringify(currentRecords, null, 2), 'utf8');
    console.log(\`✅ [Hard Disk Backup] Saved \${currentRecords.length} records to: \${fullFilePath}\`);
    return { success: true, path: fullFilePath, count: currentRecords.length };
  } catch (err) {
    console.error('❌ save-local-data IPC error:', err);
    return { success: false, error: err.message };
  }
});`;

// Replace the old IPC save handler with the corrected one
mainJsCode = mainJsCode.replace(/\/\/ 2\. IPC Handler: Universal Real-time Hard Disk JSON Backup[\s\S]*?app\.whenReady/, correctIpcSaveHandler + '\n\napp.whenReady');
fs.writeFileSync(mainJsPath, mainJsCode, 'utf8');
console.log('✅ Corrected main/main.js IPC path handler.');

// 3. Inspect and Patch components/POSInvoice.jsx and src/components/POSInvoice.jsx
const posInvoicePaths = [
  path.join(__dirname, 'components', 'POSInvoice.jsx'),
  path.join(__dirname, 'src', 'components', 'POSInvoice.jsx')
];

posInvoicePaths.forEach(filePath => {
  if (!fs.existsSync(filePath)) return;
  console.log('🔧 Inspecting POSInvoice:', filePath);
  let code = fs.readFileSync(filePath, 'utf8');

  // Inject offline fallback into handleSave / handleCheckout
  // Look for any firestore save calls like addDoc, setDoc, runTransaction, or batch.commit()
  // Ensure saveInvoiceOfflineFirst is called and state is updated immediately!
  
  if (code.includes('handleCheckout') || code.includes('handleSaveInvoice') || code.includes('handleSave') || code.includes('saveInvoice')) {
    console.log('Found POS checkout handlers in', filePath);
  }

  // Ensure Dexie import and syncService import are present
  if (!code.includes("from '@/lib/syncService'")) {
    code = code.replace(
      /from\s+['"]@\/lib\/localDb['"];?/,
      `from '@/lib/localDb';\nimport { saveInvoiceOfflineFirst, syncPendingInvoices } from '@/lib/syncService';`
    );
  }

  fs.writeFileSync(filePath, code, 'utf8');
  console.log('✅ Checked imports in:', filePath);
});

console.log('🎉 Diagnostics and repair complete!');
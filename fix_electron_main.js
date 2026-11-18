// fix_electron_main.js
const fs = require('fs');
const path = require('path');

console.log('⚡ Configuring Electron Main Process and Preload for Static Export...');

const mainDir = path.join(__dirname, 'main');
if (!fs.existsSync(mainDir)) {
  fs.mkdirSync(mainDir, { recursive: true });
}

// 1. Write Robust main/main.js
const mainJsCode = `// main/main.js - Electron Main Process for Weerakkodi POS
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows Network & GPU Crash Protections
app.commandLine.appendSwitch('disable-features', 'OutOfProcessNetworkService');
app.commandLine.appendSwitch('disable-features', 'NetworkService');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('disable-http2');
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow = null;

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
      webSecurity: false, // Allows local file & image asset access
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Load exported static index.html or fallback to localhost if dev server running
  const outIndexPath = path.join(__dirname, '..', 'out', 'index.html');

  if (fs.existsSync(outIndexPath)) {
    console.log('Loading static build from:', outIndexPath);
    mainWindow.loadFile(outIndexPath).catch(err => {
      console.error('Failed to load static build:', err);
    });
  } else {
    console.log('Static build not found, attempting localhost:3000...');
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      console.error('Neither static export nor dev server is reachable.');
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
// 1. Folder Selection Dialog (Settings UI)
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

// 2. Real-time Hard Disk JSON Backup (Append & Merge)
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

    // Default safe backup path
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

    // Merge or append data safely
    let currentData = [];
    if (fs.existsSync(fullFilePath)) {
      try {
        const raw = fs.readFileSync(fullFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          currentData = parsed;
        } else if (parsed && typeof parsed === 'object') {
          currentData = [parsed];
        }
      } catch (e) {
        currentData = [];
      }
    }

    if (Array.isArray(data)) {
      data.forEach(item => {
        const existingIdx = currentData.findIndex(x => (x.id && x.id === item.id) || (x.localId && x.localId === item.localId) || (x.invoiceNo && x.invoiceNo === item.invoiceNo));
        if (existingIdx >= 0) {
          currentData[existingIdx] = { ...currentData[existingIdx], ...item };
        } else {
          currentData.push(item);
        }
      });
    } else if (data && typeof data === 'object') {
      const existingIdx = currentData.findIndex(x => (x.id && x.id === data.id) || (x.localId && x.localId === data.localId) || (x.invoiceNo && x.invoiceNo === data.invoiceNo));
      if (existingIdx >= 0) {
        currentData[existingIdx] = { ...currentData[existingIdx], ...data };
      } else {
        currentData.push(data);
      }
    }

    fs.writeFileSync(fullFilePath, JSON.stringify(currentData, null, 2), 'utf8');
    return { success: true, path: fullFilePath, count: currentData.length };
  } catch (error) {
    console.error('Error in save-local-data IPC:', error);
    return { success: false, error: error.message };
  }
});

// App Lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
`;

fs.writeFileSync(path.join(mainDir, 'main.js'), mainJsCode, 'utf8');
console.log('✅ main/main.js updated.');

// 2. Write Standard main/preload.js
const preloadJsCode = `// main/preload.js - Preload context bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  saveLocalData: async (payloadOrPath, fileName, data) => {
    try {
      if (typeof payloadOrPath === 'object' && payloadOrPath !== null && !fileName) {
        return await ipcRenderer.invoke('save-local-data', payloadOrPath);
      }
      return await ipcRenderer.invoke('save-local-data', {
        folderPath: payloadOrPath,
        fileName,
        data
      });
    } catch (err) {
      console.error('Preload saveLocalData error:', err);
      return { success: false, error: err.message };
    }
  }
});
`;

fs.writeFileSync(path.join(mainDir, 'preload.js'), preloadJsCode, 'utf8');
console.log('✅ main/preload.js updated.');

console.log('🎉 Electron configuration ready!');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 1. Process Environment ආරක්ෂිත කිරීම
delete process.env.NODE_OPTIONS;

// 2. Network Service Crash සහ GPU ගැටළු වැළැක්වීමේ Chromium Flags
app.commandLine.appendSwitch('disable-features', 'NetworkService,OutOfProcessNetworkService');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

// Local Backup Folder Path (D:\Weerakkodi_POS_Backups)
function getBackupDirectory() {
  const dDrivePath = 'D:\\Weerakkodi_POS_Backups';
  try {
    if (fs.existsSync('D:\\')) {
      if (!fs.existsSync(dDrivePath)) {
        fs.mkdirSync(dDrivePath, { recursive: true });
      }
      return dDrivePath;
    }
  } catch (e) {
    console.warn('D: drive not accessible, falling back to AppData:', e.message);
  }

  const fallbackPath = path.join(app.getPath('userData'), 'Weerakkodi_Backups');
  if (!fs.existsSync(fallbackPath)) {
    fs.mkdirSync(fallbackPath, { recursive: true });
  }
  return fallbackPath;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    title: 'Weerakkodi POS System',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      sandbox: false
    }
  });

  const targetUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../out/index.html')}`;

  console.log(`[Electron] Loading Target: ${targetUrl}`);

  // Auto Retry Logic - Next.js dev server එක පමාවුවහොත් retry කිරීම
  function loadPageWithRetry(url, retries = 15, delay = 3000) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(url).then(() => {
      console.log(`[Electron] ✅ Page loaded successfully: ${url}`);
    }).catch((err) => {
      console.warn(`[Electron] ❌ Failed to load (${err.message}). Retries left: ${retries}`);
      if (retries > 0) {
        setTimeout(() => loadPageWithRetry(url, retries - 1, delay), delay);
      } else {
        console.error('[Electron] 🚨 All retries exhausted. Please check if Next.js is running.');
      }
    });
  }

  loadPageWithRetry(targetUrl);

  // Window එක Render වූ පසු පෙන්වන්න (Blank screen වැළැක්වීමට)
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Dev mode නම් Developer Tools විවෘත කරන්න
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // ★ Network Error Recovery — ERR_CONNECTION_REFUSED, ERR_NETWORK_CHANGED ආදිය
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Electron] ⚠️ Load failed: ${errorDescription} (${errorCode}) for ${validatedURL}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Electron] 🔄 Retrying in 3 seconds...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(targetUrl);
        }
      }, 3000);
    }
  });

  // ★ Render Process Crash Recovery
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.warn(`[Electron] ⚠️ Render process gone: ${details.reason} (exit code: ${details.exitCode})`);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Electron] 🔄 Reloading in 3 seconds...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(targetUrl);
        }
      }, 3000);
    }
  });

  // ★ WebContents Crash Recovery (older Electron versions)
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.warn(`[Electron] ⚠️ WebContents crashed (killed: ${killed}). Reloading...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(targetUrl);
        }
      }, 3000);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ══════════════════════════════════════════════════════
// IPC Handlers - Offline Local Hard Disk Backup
// ══════════════════════════════════════════════════════

ipcMain.handle('save-local-data', async (_event, { key, data }) => {
  try {
    const backupDir = getBackupDirectory();
    const filePath = path.join(backupDir, `${key}.json`);
    const payload = {
      key,
      updatedAt: new Date().toISOString(),
      data
    };
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    console.error(`[IPC] Error saving local data for key: ${key}`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-local-data', async (_event, { key }) => {
  try {
    const backupDir = getBackupDirectory();
    const filePath = path.join(backupDir, `${key}.json`);
    if (!fs.existsSync(filePath)) {
      return { success: true, data: null };
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { success: true, data: parsed.data || parsed };
  } catch (err) {
    console.error(`[IPC] Error loading local data for key: ${key}`, err);
    return { success: false, error: err.message, data: null };
  }
});

ipcMain.handle('open-backup-folder', async () => {
  try {
    const backupDir = getBackupDirectory();
    await shell.openPath(backupDir);
    return { success: true, path: backupDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 🔑 NEW: Native OS folder picker dialog for selecting backup path
ipcMain.handle('select-backup-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Backup Folder එක තෝරන්න',
      defaultPath: getBackupDirectory(),
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-backup-path', async () => {
  return getBackupDirectory();
});

// ══════════════════════════════════════════════════════
// App Lifecycle
// ══════════════════════════════════════════════════════

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
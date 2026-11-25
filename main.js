// C:\Users\chandana\StudioProjects\weerakkodi_pos_app\main.js
// ✅ Weerakkodi POS - Ultra-Stable Electron Main Process
// ✅ Safe from Quota DB Lock, Multi-Instance Conflicts, GPU Crashes & Route 404s

const { app, BrowserWindow, ipcMain, dialog, shell, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ══════════════════════════════════════════════════════
// 1. Process Environment & Performance Optimization
// ══════════════════════════════════════════════════════
delete process.env.NODE_OPTIONS;
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// ══════════════════════════════════════════════════════
// 2. GPU & Chromium Cache Flags (Crash Prevention)
// ══════════════════════════════════════════════════════
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// ══════════════════════════════════════════════════════
// 3. Single Instance Lock (Prevents IndexedDB Locks)
// ══════════════════════════════════════════════════════
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let localServer = null;
let networkCheckInterval = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Crash-proof process guards
process.on('uncaughtException', (err) => {
  console.warn('[Electron Uncaught Exception]:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Electron Unhandled Rejection]:', reason);
});

// ══════════════════════════════════════════════════════
// 4. Offline Request Blocking (Firebase Network Guard)
// ══════════════════════════════════════════════════════
function blockOfflineRequests(win) {
  const firebaseUrls = [
    '*://firestore.googleapis.com/*',
    '*://firebasestorage.googleapis.com/*',
    '*://securetoken.googleapis.com/*',
    '*://identitytoolkit.googleapis.com/*',
    '*://www.googleapis.com/*',
    '*://*.googleapis.com/*',
  ];

  win.webContents.session.webRequest.onBeforeRequest(
    { urls: firebaseUrls },
    (details, callback) => {
      try {
        if (!net.isOnline()) {
          callback({ cancel: true });
        } else {
          callback({ cancel: false });
        }
      } catch (e) {
        callback({ cancel: false });
      }
    }
  );

  if (networkCheckInterval) clearInterval(networkCheckInterval);
  networkCheckInterval = setInterval(() => {
    if (win && !win.isDestroyed()) {
      const online = net.isOnline();
      win.webContents.send('network-status', online);
    }
  }, 5000);
}

// ══════════════════════════════════════════════════════
// 5. Robust Static Local HTTP Server for Next.js (out/)
// ══════════════════════════════════════════════════════
function startLocalServer(dir, port) {
  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
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
      '.webp': 'image/webp',
      '.map': 'application/json'
    };

    localServer = http.createServer((req, res) => {
      try {
        let urlPath = req.url.split('?')[0];
        let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);

        // Smart route resolution for Next.js static exports
        if (!fs.existsSync(filePath)) {
          if (fs.existsSync(filePath + '.html')) {
            filePath = filePath + '.html';
          } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
            filePath = path.join(filePath, 'index.html');
          } else {
            // SPA Fallback to root index.html
            filePath = path.join(dir, 'index.html');
          }
        } else if (fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
          if (!fs.existsSync(filePath)) {
            filePath = path.join(dir, 'index.html');
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, data) => {
          if (err) {
            fs.readFile(path.join(dir, 'index.html'), (err2, data2) => {
              if (err2) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404: Not Found');
                return;
              }
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(data2);
            });
            return;
          }
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500: Internal Server Error');
      }
    });

    localServer.listen(port, '127.0.0.1', () => {
      console.log('[Server] Local static server active on http://127.0.0.1:' + port);
      resolve(port);
    });

    localServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log('[Server] Port ' + port + ' in use, reusing instance');
        resolve(port);
      } else {
        reject(e);
      }
    });
  });
}

// ══════════════════════════════════════════════════════
// 6. User-Friendly Backup Directory Resolvers
// ══════════════════════════════════════════════════════
function getBackupDirectory() {
  // 1st Preference: D:\Weerakkodi_POS_Backups
  try {
    if (fs.existsSync('D:\\')) {
      const dDrivePath = 'D:\\Weerakkodi_POS_Backups';
      if (!fs.existsSync(dDrivePath)) fs.mkdirSync(dDrivePath, { recursive: true });
      return dDrivePath;
    }
  } catch (e) {}

  // 2nd Preference: C:\Weerakkodi_POS_Backups (Easy for store owners to access)
  try {
    const cDrivePath = 'C:\\Weerakkodi_POS_Backups';
    if (!fs.existsSync(cDrivePath)) fs.mkdirSync(cDrivePath, { recursive: true });
    return cDrivePath;
  } catch (e) {}

  // 3rd Preference: AppData directory
  const fallbackPath = path.join(app.getPath('userData'), 'Weerakkodi_Backups');
  if (!fs.existsSync(fallbackPath)) fs.mkdirSync(fallbackPath, { recursive: true });
  return fallbackPath;
}

function resolveBackupDir(customPath) {
  if (customPath && typeof customPath === 'string' && customPath.trim().length > 0) {
    const trimmed = customPath.trim();
    try {
      if (fs.existsSync(trimmed)) return trimmed;
      fs.mkdirSync(trimmed, { recursive: true });
      return trimmed;
    } catch (e) {}
  }
  return getBackupDirectory();
}

// ══════════════════════════════════════════════════════
// 7. Window Creation & Configuration
// ══════════════════════════════════════════════════════
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    title: 'Weerakkodi POS System',
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true, // Clean POS UI
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: false,
      backgroundThrottling: false,
      allowRunningInsecureContent: true,
    }
  });

  mainWindow.webContents.setBackgroundThrottling(false);
  blockOfflineRequests(mainWindow);

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    console.log('[Electron] Dev mode — loading http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const localUrl = 'http://127.0.0.1:' + port;
    console.log('[Electron] Production mode — loading', localUrl);

    const tryLoad = (retries) => {
      mainWindow.loadURL(localUrl).catch((err) => {
        if (retries > 0) {
          setTimeout(() => tryLoad(retries - 1), 1000);
        } else {
          mainWindow.loadURL(`data:text/html;charset=utf-8,
            <html><body style="background:#0f172a;color:white;font-family:sans-serif;padding:40px">
              <h1>⚠️ Application Loading Failed</h1>
              <p>${err.message}</p>
            </body></html>`);
        }
      });
    };
    setTimeout(() => tryLoad(3), 1000);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    if (networkCheckInterval) clearInterval(networkCheckInterval);
    mainWindow = null;
  });
}

// ══════════════════════════════════════════════════════
// 8. App Lifecycle Handlers
// ══════════════════════════════════════════════════════
app.whenReady().then(async () => {
  try {
    await session.defaultSession.clearHostResolverCache();
  } catch (e) {}

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    createWindow(3000);
  } else {
    const outDir = path.join(__dirname, 'out');
    const port = 19876;
    try {
      await startLocalServer(outDir, port);
      createWindow(port);
    } catch (e) {
      createWindow(port);
    }
  }
});

app.on('window-all-closed', () => {
  if (localServer) {
    try { localServer.close(); } catch(e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(19876);
});

// ══════════════════════════════════════════════════════
// 9. IPC HANDLERS - Hard Disk Backups, Printing & System
// ══════════════════════════════════════════════════════

// Save general JSON data to local PC disk
ipcMain.handle('save-local-data', async (_event, { key, data, customPath }) => {
  try {
    const backupDir = resolveBackupDir(customPath);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const fileName = key.endsWith('.json') ? key : `${key}.json`;
    const filePath = path.join(backupDir, fileName);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save single invoice backup JSON
ipcMain.handle('save-backup-invoice', async (_event, invoiceData) => {
  try {
    const backupDir = getBackupDirectory();
    const invoicesDir = path.join(backupDir, 'Invoices');
    if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
    const fileName = `${invoiceData.invoiceNo || invoiceData.id || Date.now()}.json`;
    const filePath = path.join(invoicesDir, fileName);
    await fs.promises.writeFile(filePath, JSON.stringify(invoiceData, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Load JSON data from local PC disk
ipcMain.handle('load-local-data', async (_event, { key, customPath }) => {
  try {
    const backupDir = resolveBackupDir(customPath);
    const fileName = key.endsWith('.json') ? key : `${key}.json`;
    const filePath = path.join(backupDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
});

// Open backup folder in Windows File Explorer
ipcMain.handle('open-backup-folder', async (_event, args) => {
  try {
    const backupDir = resolveBackupDir(args?.customPath);
    await shell.openPath(backupDir);
    return { success: true, path: backupDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Select custom folder dialog
ipcMain.handle('select-backup-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Backup Folder එක තෝරන්න',
      defaultPath: getBackupDirectory(),
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    return { success: true, path: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 🖨️ POS Thermal Printer Handlers
ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) return [];
    return await mainWindow.webContents.getPrintersAsync();
  } catch (e) {
    return [];
  }
});

ipcMain.handle('print-silent', async (_event, { printerName }) => {
  try {
    if (!mainWindow) return { success: false, error: 'No active window' };
    const printOptions = {
      silent: true,
      printBackground: true,
      deviceName: printerName || ''
    };
    return new Promise((resolve) => {
      mainWindow.webContents.print(printOptions, (success, failureReason) => {
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// System Info
ipcMain.handle('get-backup-path', async () => getBackupDirectory());
ipcMain.handle('is-online', () => net.isOnline());
ipcMain.handle('get-app-version', () => app.getVersion());
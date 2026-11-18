const { app, BrowserWindow, ipcMain, dialog, shell, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ══════════════════════════════════════════════════════
// 🔑 NETWORK FIXES — BEFORE app.ready
// ══════════════════════════════════════════════════════
// ⚠️ REMOVED host-resolver-rules — they were blocking 127.0.0.1!
app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let mainWindow;
let localServer;
let networkCheckInterval = null;

// ══════════════════════════════════════════════════════
// 🚫 OFFLINE REQUEST BLOCKING (Electron Network Level)
// ══════════════════════════════════════════════════════
function blockOfflineRequests(win) {
  const firebaseUrls = [
    '*://firestore.googleapis.com/*',
    '*://firebasestorage.googleapis.com/*',
    '*://securetoken.googleapis.com/*',
    '*://identitytoolkit.googleapis.com/*',
    '*://www.googleapis.com/*',
    '*://www.google.com/images/*',
    '*://*.googleapis.com/*',
  ];

  // Block ALL Firebase network requests when OS reports offline
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: firebaseUrls },
    (details, callback) => {
      if (!net.isOnline()) {
        // Silently cancel — no ERR_INTERNET_DISCONNECTED in console
        callback({ cancel: true });
      } else {
        callback({ cancel: false });
      }
    }
  );

  // Also suppress error-level console noise from failed requests
  win.webContents.session.webRequest.onErrorOccurred(
    { urls: firebaseUrls },
    (details) => {
      // This fires after a request fails — we just log silently
      if (!net.isOnline()) {
        // Expected when offline, do nothing
      }
    }
  );

  // Send network status to renderer every 5 seconds
  if (networkCheckInterval) clearInterval(networkCheckInterval);
  networkCheckInterval = setInterval(() => {
    if (win && !win.isDestroyed()) {
      const online = net.isOnline();
      win.webContents.send('network-status', online);
    }
  }, 5000);

  console.log('[Network] ✅ Offline request blocking active');
}

// === Simple static file server for out/ folder ===
function startLocalServer(dir, port) {
  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
      '.webp': 'image/webp', '.map': 'application/json'
    };
    localServer = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
      
      // ✅ SPA fallback: if file not found, serve index.html
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        if (!fs.existsSync(filePath)) {
          filePath = path.join(dir, 'index.html');
        }
      }
      
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          // ✅ Ultimate fallback: serve index.html for any route
          fs.readFile(path.join(dir, 'index.html'), (err2, data2) => {
            if (err2) { res.writeHead(404); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
    localServer.listen(port, '127.0.0.1', () => {
      console.log('[Server] Running on http://127.0.0.1:' + port);
      resolve(port);
    });
    localServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log('[Server] Port ' + port + ' already in use, reusing');
        resolve(port);
      } else {
        console.error('[Server] Error:', e.message);
        reject(e);
      }
    });
  });
}

// === Backup Directory Helper ===
function getBackupDirectory() {
  const dDrivePath = 'D:\\Weerakkodi_POS_Backups';
  try {
    if (fs.existsSync('D:\\')) {
      if (!fs.existsSync(dDrivePath)) fs.mkdirSync(dDrivePath, { recursive: true });
      return dDrivePath;
    }
  } catch (e) {
    console.warn('D: drive not accessible:', e.message);
  }
  const fallbackPath = path.join(app.getPath('documents'), 'WeerakkodiPOS', 'backups');
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
    } catch (e) {
      console.warn(`[Backup] Custom path not accessible: ${trimmed}`);
    }
  }
  return getBackupDirectory();
}

function createWindow(port) {
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
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: false,
      backgroundThrottling: false,
      allowRunningInsecureContent: true,
    }
  });

  mainWindow.webContents.setBackgroundThrottling(false);

  // ✅ BLOCK FIREBASE REQUESTS WHEN OFFLINE (OS-level)
  blockOfflineRequests(mainWindow);

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  mainWindow.webContents.session.clearHostResolverCache().catch(() => {});

  // ✅ FIXED: isDev check — packaged app uses && not ||
  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

  if (isDev) {
    console.log('[Electron] Dev mode — loading localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // ✅ Packaged mode — load from local server
    const localUrl = 'http://127.0.0.1:' + port;
    console.log('[Electron] Production mode — loading', localUrl);
    
    // ✅ Wait for server to be ready, then load
    const tryLoad = (retries) => {
      mainWindow.loadURL(localUrl).then(() => {
        console.log('[Electron] ✅ App loaded successfully from', localUrl);
      }).catch((err) => {
        if (retries > 0) {
          console.log(`[Electron] Retry loading... (${retries} left)`);
          setTimeout(() => tryLoad(retries - 1), 1000);
        } else {
          console.error('[Electron] ❌ All retries failed:', err.message);
          mainWindow.loadURL(`data:text/html;charset=utf-8,
            <html><body style="background:#0f172a;color:white;font-family:sans-serif;padding:40px">
              <h1>⚠️ App Load Error</h1>
              <p>Local server failed to start.</p>
              <p>Error: ${err.message}</p>
              <p>Try restarting the application.</p>
            </body></html>`);
        }
      });
    };
    
    // Start loading after 2 second delay for server startup
    setTimeout(() => tryLoad(3), 2000);
    
    // DevTools for debugging (remove in final release)
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    // Only log non-Firebase failures (Firebase ones are blocked silently)
    if (!url.includes('googleapis.com') && !url.includes('google.com')) {
      console.error(`[Network] Failed: ${url} [${code}] ${desc}`);
    }
  });

  mainWindow.on('closed', () => {
    if (networkCheckInterval) {
      clearInterval(networkCheckInterval);
      networkCheckInterval = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await session.defaultSession.clearHostResolverCache();
    console.log('[Startup] DNS cache cleared');
  } catch (e) {
    console.warn('[Startup] DNS cache clear failed:', e.message);
  }

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));

  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

  if (isDev) {
    createWindow(3000);
  } else {
    // ✅ In packaged app, out/ is inside resources/app.asar/
    const outDir = path.join(__dirname, 'out');
    const port = 19876;

    console.log('[Startup] Looking for out/ at:', outDir);
    console.log('[Startup] out/ exists:', fs.existsSync(outDir));

    if (fs.existsSync(outDir)) {
      const indexPath = path.join(outDir, 'index.html');
      console.log('[Startup] index.html exists:', fs.existsSync(indexPath));
    }

    try {
      await startLocalServer(outDir, port);
      createWindow(port);
    } catch (e) {
      console.error('[Startup] Server failed:', e.message);
      createWindow(port);
    }
  }
});

app.on('window-all-closed', () => {
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
  }
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(19876);
});

// ══════════════════════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════════════════════

const BACKUP_DIR = path.join(app.getPath('documents'), 'WeerakkodiPOS', 'backups');

ipcMain.handle('backup-to-disk', async (event, data) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = path.join(BACKUP_DIR, 'backup-' + ts + '.json');
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-')).sort();
    while (files.length > 20) { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); }
    return { success: true, path: filePath, size: fs.statSync(filePath).size };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('restore-from-disk', async (event, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { success: true, data: JSON.parse(raw) };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-backup-list', async () => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-')).sort().reverse()
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
  } catch (e) { return []; }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-backup-stats', async (_event, args) => {
  try {
    const backupDir = resolveBackupDir(args?.customPath);
    if (!fs.existsSync(backupDir)) return { success: true, path: backupDir, fileCount: 0, totalSizeMB: '0', lastBackup: null };
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    let totalSize = 0, lastModified = null;
    for (const f of files) {
      try {
        const stat = fs.statSync(path.join(backupDir, f));
        totalSize += stat.size;
        if (!lastModified || stat.mtime > lastModified) lastModified = stat.mtime;
      } catch {}
    }
    return { success: true, path: backupDir, fileCount: files.length, totalSizeMB: (totalSize / 1024 / 1024).toFixed(2), lastBackup: lastModified ? lastModified.toISOString() : null };
  } catch (err) { return { success: false, error: err.message, fileCount: 0, totalSizeMB: '0', lastBackup: null }; }
});

ipcMain.handle('list-backup-files', async (_event, args) => {
  try {
    const backupDir = resolveBackupDir(args?.customPath);
    if (!fs.existsSync(backupDir)) return { success: true, files: [] };
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).map(f => {
      try { const stat = fs.statSync(path.join(backupDir, f)); return { name: f, size: stat.size, lastModified: stat.mtime.toISOString() }; } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    return { success: true, files };
  } catch (err) { return { success: false, error: err.message, files: [] }; }
});

ipcMain.handle('open-backup-folder', async (_event, args) => {
  try {
    const backupDir = resolveBackupDir(args?.customPath);
    await shell.openPath(backupDir);
    return { success: true, path: backupDir };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('select-backup-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Backup Folder එක තෝරන්න', defaultPath: getBackupDirectory(),
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    return { success: true, path: result.filePaths[0] };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-backup-path', async () => getBackupDirectory());

ipcMain.handle('save-local-data', async (_event, { key, data, customPath }) => {
  try {
    const backupDir = resolveBackupDir(customPath);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const fileName = key.endsWith('.json') ? key : `${key}.json`;
    const filePath = path.join(backupDir, fileName);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-local-data', async (_event, { key, customPath }) => {
  try {
    const backupDir = resolveBackupDir(customPath);
    const fileName = key.endsWith('.json') ? key : `${key}.json`;
    const filePath = path.join(backupDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) { return null; }
});

// ══════════════════════════════════════════════════════
// 🌐 NETWORK STATUS IPC
// ══════════════════════════════════════════════════════
ipcMain.handle('is-online', () => net.isOnline());
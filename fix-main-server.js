const fs = require('fs');
const f = 'main.js';

const newMain = `const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let localServer;

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
      let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: serve index.html for routes
          const indexPath = path.join(dir, 'index.html');
          fs.readFile(indexPath, (err2, data2) => {
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
      console.log('Local server running on http://127.0.0.1:' + port);
      resolve(port);
    });
    localServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        resolve(port); // already running
      } else {
        reject(e);
      }
    });
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('http://127.0.0.1:' + port);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    createWindow(3000);
  } else {
    const outDir = path.join(__dirname, 'out');
    const port = 19876;
    try {
      await startLocalServer(outDir, port);
      createWindow(port);
    } catch (e) {
      console.error('Server failed:', e);
      createWindow(port);
    }
  }
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(19876); });

// === BACKUP IPC HANDLERS ===
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
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('restore-from-disk', async (event, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { success: true, data: JSON.parse(raw) };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-'))
      .sort().reverse()
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
  } catch (e) { return []; }
});

ipcMain.handle('get-app-version', () => app.getVersion());
`;

fs.writeFileSync(f, newMain, 'utf8');
console.log('OK - main.js rewritten with local HTTP server!');
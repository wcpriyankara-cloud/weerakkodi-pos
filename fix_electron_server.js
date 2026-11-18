// fix_electron_server.js
const fs = require('fs');
const path = require('path');

console.log('⚡ Upgrading Electron with Native Embedded Offline Server...');

const mainJsPath = path.join(__dirname, 'main', 'main.js');

const mainJsCode = `// main/main.js - Electron Main Process with Embedded Offline Server
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

let mainWindow = null;
let localServer = null;

// MIME Types for fast local static serving
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

function startLocalServer(callback) {
  const outDir = path.join(__dirname, '..', 'out');

  localServer = http.createServer((req, res) => {
    try {
      const parsedUrl = url.parse(req.url);
      let pathname = decodeURIComponent(parsedUrl.pathname);

      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }

      let filePath = path.join(outDir, pathname);

      // SPA directory & html fallback resolution
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

  // Listen on random available local port (100% offline on loopback)
  localServer.listen(0, '127.0.0.1', () => {
    const port = localServer.address().port;
    console.log(\`✅ Offline POS Server active at: http://127.0.0.1:\${port}\`);
    callback(port);
  });
}

function createWindow(port) {
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

  const targetUrl = \`http://127.0.0.1:\${port}\`;
  console.log('Loading Weerakkodi POS App from:', targetUrl);
  mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 1. IPC Handler: Select Backup Folder (Settings UI)
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

// 2. IPC Handler: Real-time HDD JSON Backup (Append & Merge)
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
    return { success: true, path: fullFilePath, count: currentData.length };
  } catch (error) {
    console.error('Error in save-local-data IPC:', error);
    return { success: false, error: error.message };
  }
});

// App lifecycle
app.whenReady().then(() => {
  startLocalServer((port) => {
    createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
`;

fs.writeFileSync(mainJsPath, mainJsCode, 'utf8');
console.log('✅ main/main.js successfully updated with embedded local server!');
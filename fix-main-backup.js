const fs = require('fs');
const f = 'main.js';

if (!fs.existsSync(f)) {
  console.log('main.js NOT FOUND! Creating new one...');
  const newMain = `const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'public', 'icon.png'),
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
    mainWindow.loadFile(path.join(__dirname, 'out', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

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
      .sort()
      .reverse()
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), size: fs.statSync(path.join(BACKUP_DIR, f)).size }));
  } catch (e) { return []; }
});

ipcMain.handle('get-app-version', () => app.getVersion());
`;
  fs.writeFileSync(f, newMain, 'utf8');
  console.log('OK - Created new main.js with backup handlers!');
  process.exit();
}

let c = fs.readFileSync(f, 'utf8');

// Check if already has backup handler
if (c.includes('backup-to-disk')) {
  console.log('main.js already has backup handler. SKIP.');
  process.exit();
}

// Add preload to BrowserWindow if missing
if (!c.includes('preload')) {
  c = c.replace(
    /webPreferences\s*:\s*\{/,
    "webPreferences: {\n      preload: path.join(__dirname, 'preload.js'),\n      contextIsolation: true,"
  );
  console.log('Added preload to BrowserWindow');
}

// Add IPC handlers before last line
const ipcCode = `
// === BACKUP IPC HANDLERS ===
const BACKUP_DIR = require('path').join(require('electron').app.getPath('documents'), 'WeerakkodiPOS', 'backups');
const { ipcMain, dialog } = require('electron');

ipcMain.handle('backup-to-disk', async (event, data) => {
  try {
    require('fs').mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = require('path').join(BACKUP_DIR, 'backup-' + ts + '.json');
    require('fs').writeFileSync(filePath, JSON.stringify(data), 'utf8');
    const files = require('fs').readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-')).sort();
    while (files.length > 20) { require('fs').unlinkSync(require('path').join(BACKUP_DIR, files.shift())); }
    return { success: true, path: filePath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('restore-from-disk', async (event, filePath) => {
  try { return { success: true, data: JSON.parse(require('fs').readFileSync(filePath, 'utf8')) }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('select-file', async () => {
  const r = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('get-backup-list', async () => {
  try {
    if (!require('fs').existsSync(BACKUP_DIR)) return [];
    return require('fs').readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-')).sort().reverse()
      .map(f => ({ name: f, path: require('path').join(BACKUP_DIR, f) }));
  } catch (e) { return []; }
});
`;

c = c.trimEnd() + '\n' + ipcCode + '\n';
fs.writeFileSync(f, c, 'utf8');
console.log('OK - main.js updated with backup IPC handlers!');
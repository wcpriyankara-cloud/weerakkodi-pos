const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Existing methods ──
  isElectron: true,
  triggerBackup: (data) => ipcRenderer.invoke('backup-to-disk', data),
  restoreBackup: (filePath) => ipcRenderer.invoke('restore-from-disk', filePath),
  selectFile: () => ipcRenderer.invoke('select-file'),
  getBackupList: () => ipcRenderer.invoke('get-backup-list'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ── 🔑 POS Backup System — customPath support added ──
  getBackupStats: (customPath) => ipcRenderer.invoke('get-backup-stats', { customPath }),
  listBackupFiles: (customPath) => ipcRenderer.invoke('list-backup-files', { customPath }),
  openBackupFolder: (customPath) => ipcRenderer.invoke('open-backup-folder', { customPath }),
  selectBackupFolder: () => ipcRenderer.invoke('select-backup-folder'),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  saveLocalData: (key, data, customPath) => ipcRenderer.invoke('save-local-data', { key, data, customPath }),
  loadLocalData: (key, customPath) => ipcRenderer.invoke('load-local-data', { key, customPath }),

  // ── 🌐 Network Status (main.js → renderer push every 5s) ──
  isOnline: () => ipcRenderer.invoke('is-online'),
  onNetworkStatus: (callback) => {
    const handler = (_event, online) => callback(online);
    ipcRenderer.on('network-status', handler);
    // Return cleanup function so React can unsubscribe
    return () => ipcRenderer.removeListener('network-status', handler);
  },
});
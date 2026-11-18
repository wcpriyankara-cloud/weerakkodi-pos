// main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveLocalData: (key, data) => ipcRenderer.invoke('save-local-data', { key, data }),
  loadLocalData: (key) => ipcRenderer.invoke('load-local-data', { key }),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  // 🔑 FIX: New method for selecting backup folder via native dialog
  selectBackupFolder: () => ipcRenderer.invoke('select-backup-folder'),
});
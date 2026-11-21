// C:\Users\chandana\StudioProjects\weerakkodi_pos_app\preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveLocalData: (key, data, customPath) => ipcRenderer.invoke('save-local-data', { key, data, customPath }),
  saveBackupInvoice: (invoiceData) => ipcRenderer.invoke('save-backup-invoice', invoiceData),
  loadLocalData: (key, customPath) => ipcRenderer.invoke('load-local-data', { key, customPath }),
  openBackupFolder: (args) => ipcRenderer.invoke('open-backup-folder', args),
  selectBackupFolder: () => ipcRenderer.invoke('select-backup-folder'),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  isOnline: () => ipcRenderer.invoke('is-online'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onNetworkStatus: (callback) => ipcRenderer.on('network-status', (_event, status) => callback(status)),
});
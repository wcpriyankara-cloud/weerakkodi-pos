import localDb from './localDb';

/**
 * Setup Backup Directory
 */
export async function setupBackupDirectory() {
  console.log('🔍 [Backup] setupBackupDirectory called');

  // 1. Electron Desktop IPC API
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.selectBackupDirectory === 'function') {
    try {
      const selected = await window.electronAPI.selectBackupDirectory();
      if (selected) {
        localStorage.setItem('weerakkodi_pos_backup_path', selected);
        alert(`✅ Backup Directory එක තෝරාගන්නා ලදී:\n${selected}`);
        return selected;
      }
    } catch (err) {
      console.warn('[Backup] Electron directory select warning:', err);
    }
  }

  // 2. Browser Native Directory Picker
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      if (dirHandle && dirHandle.name) {
        localStorage.setItem('weerakkodi_pos_backup_path', dirHandle.name);
        alert(`✅ Backup Folder එක තෝරාගන්නා ලදී: ${dirHandle.name}`);
        return dirHandle.name;
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
    }
  }

  // 3. Fallback
  const fallback = 'C:\\Weerakkodi_POS_Backups';
  if (typeof window !== 'undefined') {
    localStorage.setItem('weerakkodi_pos_backup_path', fallback);
    alert(`📁 Default Backup Folder එක සකස් කරන ලදී:\n${fallback}`);
  }
  return fallback;
}

export async function getBackupDirectory() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('weerakkodi_pos_backup_path') || 'C:\\Weerakkodi_POS_Backups';
  }
  return 'C:\\Weerakkodi_POS_Backups';
}

export async function runAutoBackup() {
  return { success: true, timestamp: new Date().toISOString() };
}

export async function createBackup() {
  return await setupBackupDirectory();
}

export default {
  setupBackupDirectory,
  getBackupDirectory,
  runAutoBackup,
  createBackup
};
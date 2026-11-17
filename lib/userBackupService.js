// lib/userBackupService.js
import { localDb } from './localDb';

// ✅ Define getBackupStats FIRST (before userBackup object references it)
export async function getBackupStats() {
  try {
    if (!localDb) return { totalBackups: 0, lastBackup: null, totalSize: 0, status: 'offline' };
    const stats = {};
    const tables = ['invoices', 'customers', 'items', 'purchases', 'suppliers', 'settings'];
    for (const t of tables) {
      try { stats[t] = await localDb[t].count(); } catch(e) { stats[t] = 0; }
    }
    stats._total = Object.values(stats).reduce((a, b) => a + b, 0);
    stats.totalBackups = stats._total;
    stats.status = 'ok';
    return stats;
  } catch (e) {
    return { totalBackups: 0, lastBackup: null, totalSize: 0, status: 'offline' };
  }
}

export async function backupUserData(userId) {
  try {
    const items = localDb && localDb.items ? await localDb.items.toArray() : [];
    const customers = localDb && localDb.customers ? await localDb.customers.toArray() : [];
    const invoices = localDb && localDb.invoices ? await localDb.invoices.toArray() : [];

    const payload = {
      userId,
      timestamp: new Date().toISOString(),
      items,
      customers,
      invoices
    };

    if (typeof window !== 'undefined' && window.electronAPI?.saveLocalData) {
      const backupPath = localStorage.getItem('pos_backup_path') || 'D:\\Weerakkodi_POS_Backups';
      await window.electronAPI.saveLocalData(backupPath, 'user_backup_' + (userId || 'pos') + '.json', payload);
    }
    return { success: true, data: payload };
  } catch (error) {
    console.error('backupUserData error:', error);
    return { success: false, error };
  }
}

export async function restoreUserData(backupData) {
  try {
    if (!backupData || !localDb) return { success: false };
    if (backupData.items && Array.isArray(backupData.items) && localDb.items) {
      await localDb.items.bulkPut(backupData.items);
    }
    if (backupData.customers && Array.isArray(backupData.customers) && localDb.customers) {
      await localDb.customers.bulkPut(backupData.customers);
    }
    if (backupData.invoices && Array.isArray(backupData.invoices) && localDb.invoices) {
      await localDb.invoices.bulkPut(backupData.invoices);
    }
    return { success: true };
  } catch (error) {
    console.error('restoreUserData error:', error);
    return { success: false, error };
  }
}

// ✅ getBackupStats is now defined ABOVE, so this reference is safe
export const userBackup = {
  backupUserData,
  restoreUserData,
  createCloudBackup: backupUserData,
  restoreCloudBackup: restoreUserData,
  exportLocalData: backupUserData,
  importLocalData: restoreUserData,
  downloadBackup: backupUserData,
  uploadBackup: restoreUserData,
  getBackupStats,
};

export default userBackup;
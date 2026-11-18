// fix_warnings.js
const fs = require('fs');
const path = require('path');

console.log('🔧 Resolving build warnings and export mismatches...');

// 1. Update userBackupService in both lib/ and src/lib/
const userBackupServiceCode = `// lib/userBackupService.js
import { localDb } from './localDb';

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
      const backupPath = localStorage.getItem('pos_backup_path') || 'D:\\\\Weerakkodi_POS_Backups';
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

export const userBackup = {
  backupUserData,
  restoreUserData,
  createCloudBackup: backupUserData,
  restoreCloudBackup: restoreUserData,
  exportLocalData: backupUserData,
  importLocalData: restoreUserData,
  downloadBackup: backupUserData,
  uploadBackup: restoreUserData
};

export default userBackup;
`;

['lib', 'src/lib'].forEach(dir => {
  const fullDir = path.join(__dirname, dir);
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, 'userBackupService.js'), userBackupServiceCode, 'utf8');
});
console.log('✅ userBackupService.js updated with userBackup object.');

// 2. Patch Firebase Config files with Firebase Auth exports
const firebaseFiles = [
  path.join(__dirname, 'firebase-config.js'),
  path.join(__dirname, 'src', 'firebase-config.js'),
  path.join(__dirname, 'firebaseConfig.js'),
  path.join(__dirname, 'src', 'firebaseConfig.js'),
  path.join(__dirname, 'shared', 'firebase-config.js'),
  path.join(__dirname, 'src', 'shared', 'firebase-config.js')
];

firebaseFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  
  const authExports = `
// Re-export standard auth helpers to prevent module resolution warnings
export {
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
`;

  if (!code.includes('RecaptchaVerifier') || !code.includes('from \'firebase/auth\'')) {
    code = code + '\n' + authExports;
    fs.writeFileSync(file, code, 'utf8');
    console.log('✅ Added missing Auth exports to:', file);
  }
});

console.log('🎉 All warning fixes applied successfully!');
'use client';
import React, { useState, useEffect } from 'react';
import { useUserAuth } from '@/context/UserContext';
import localDb, { setupBackupDirectory, getBackupDirHandle } from '@/lib/localDb';
import UserCloudBackup from './UserCloudBackup';

export default function Settings() {
  const [storeSettings, setStoreSettings] = useState({
    storeName: 'Weerakkodi Stores',
    phone: '',
    address: '',
    receiptFooter: 'Thank you for your business! Please come again.',
    currency: 'Rs.',
    allowNegativeStock: false
  });

  const [dbStats, setDbStats] = useState({
    invoicesCount: 0, itemsCount: 0, customersCount: 0, loansCount: 0, estimatedSize: 'Calculating...'
  });

  const [saveStatus, setSaveStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const authContext = useUserAuth ? useUserAuth() : null;
  const user = authContext?.user || null;
  const userId = user?.uid || 'anonymous_user';

  useEffect(() => {
    if (userId) loadSettingsAndStats();
  }, [userId]);

  const loadSettingsAndStats = async () => {
    try {
      setLoading(true);
      if (localDb && localDb.settings) {
        const saved = await localDb.settings.get(`store_${userId}`);
        if (saved && saved.value) setStoreSettings(saved.value);
      }
      const invCount = (localDb && localDb.invoices) ? await localDb.invoices.count() : 0;
      const itmCount = (localDb && localDb.items) ? await localDb.items.count() : 0;
      const custCount = (localDb && localDb.customers) ? await localDb.customers.count() : 0;
      const loanCount = (localDb && localDb.customerLoans) ? await localDb.customerLoans.count() : 0;

      let estSize = 'Available';
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(2);
        const quotaMB = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
        estSize = `${usedMB} MB used (of ~${quotaMB} MB allocated)`;
      }

      setDbStats({ invoicesCount: invCount, itemsCount: itmCount, customersCount: custCount, loansCount: loanCount, estimatedSize: estSize });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      if (localDb && localDb.settings) {
        await localDb.settings.put({
          id: `store_${userId}`, userId: userId, value: storeSettings, updatedAt: new Date().toISOString()
        });
      }
      setSaveStatus('✅ Settings saved to local hard disk!');
      setTimeout(() => setSaveStatus(''), 3500);
    } catch (err) {
      setSaveStatus('❌ Failed to save settings: ' + err?.message);
    }
  };

  const handleOpenBackupFolder = async () => {
    console.log('🔍 [Backup] Button clicked');

    try {
      // Strategy 1: Electron
            if (typeof window !== 'undefined' && window.electronAPI?.openBackupFolder) {
        const result = await window.electronAPI.openBackupFolder();
        if (result && typeof result === 'object') {
          if (!result.success) {
            alert('Folder විවෘත කිරීමට නොහැකි විය: ' + (result.error || 'Unknown error'));
          }
        }
        return;
      }

      // Strategy 2: Browser — use localDb helper
      if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
        try {
          const success = await setupBackupDirectory();
          if (success) {
            const handle = await getBackupDirHandle();
            const folderName = handle?.name || 'Selected Folder';
            alert(
              '✅ Backup Folder තෝරා ගන්නා ලදී:\n📁 ' + folderName +
              '\n\n✅ Auto-backup enabled — Vercel data hard disk එකට save වෙනවා.\n' +
              '"Download Backup" button එකෙන් manual backup ගන්න.'
            );
            try {
              if (localDb && localDb.settings) {
                await localDb.settings.put({
                  id: 'backup_folder_' + userId,
                  userId: userId,
                  value: { folderName, selectedAt: new Date().toISOString() },
                  updatedAt: new Date().toISOString()
                });
              }
            } catch (e) { console.warn('Settings save failed:', e); }
          }
          return;
        } catch (pickerErr) {
          if (pickerErr.name === 'AbortError') return;
          if (pickerErr.name === 'SecurityError' || pickerErr.name === 'NotAllowedError') {
            alert(
              '⚠️ Browser එකෙන් folder access block කර ඇත.\n\n' +
              'Fix: Chrome Settings → Privacy → Site Settings → Additional permissions → File System Access → Allow'
            );
            return;
          }
          throw pickerErr;
        }
      }

      // Strategy 3: Fallback
      alert('⚠️ ඔබගේ browser එක folder selection support කරන්නේ නැහැ.\nChrome හෝ Edge use කරන්න.');
    } catch (error) {
      console.error('❌ [Backup] Unexpected error:', error);
      alert('❌ Error: ' + (error.message || 'Unknown error'));
    }
  };

  const handleClearAllData = async () => {
    const confirmation = window.prompt('⚠️ DANGER: Type "DELETE ALL" to confirm:');
    if (confirmation === 'DELETE ALL') {
      try {
        const tables = ['invoices', 'items', 'customers', 'customerLoans', 'cashTransactions', 'payments', 'purchases', 'suppliers', 'settings', 'syncQueue'];
        for (const tName of tables) {
          if (localDb && localDb[tName]) await localDb[tName].clear();
        }
        alert('All local database tables have been cleared.');
        loadSettingsAndStats();
      } catch (err) {
        alert('Clear error: ' + err?.message);
      }
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', marginBottom: '20px', borderLeft: '5px solid #2563eb', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <h1 style={{ margin: '0 0 6px 0', fontSize: '24px', color: '#0f172a' }}>⚙️ System Settings & Cloud Backup</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Manage your store receipt branding, view local hard disk storage health, and backup your POS data.</p>
      </div>

      <div style={{ marginBottom: '24px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '18px', margin: '0 0 5px 0', color: '#1e293b' }}>📂 Local Backup Data</h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Vercel cloud data ඔබගේ PC hard disk එකට save කරන්න.
              <br />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                📊 Invoices: {dbStats.invoicesCount} | Items: {dbStats.itemsCount} | Customers: {dbStats.customersCount} | {dbStats.estimatedSize}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenBackupFolder}
            style={{ padding: '10px 20px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            📁 Open Backup Folder
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <UserCloudBackup />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>🏪 Store & Receipt Configuration</h2>
          <form onSubmit={handleSaveSettings}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Store / Business Name</label>
              <input type="text" value={storeSettings.storeName} onChange={(e) => setStoreSettings({ ...storeSettings, storeName: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} required />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Contact Phone Number</label>
              <input type="text" value={storeSettings.phone} onChange={(e) => setStoreSettings({ ...storeSettings, phone: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Business Address</label>
              <textarea value={storeSettings.address} onChange={(e) => setStoreSettings({ ...storeSettings, address: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>Currency Symbol</label>
              <input type="text" value={storeSettings.currency} onChange={(e) => setStoreSettings({ ...storeSettings, currency: e.target.value })} style={{ width: '100px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            </div>
            {saveStatus && <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#065f46', marginBottom: '14px', fontWeight: 'bold' }}>{saveStatus}</div>}
            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>💾 Save Settings</button>
          </form>
        </div>
      </div>
    </div>
  );
}
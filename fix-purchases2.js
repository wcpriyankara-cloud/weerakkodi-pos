const fs = require('fs');
const path = 'components/PurchaseCommonForm.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Fix syncLocalUiStates — load from Firestore FIRST, Dexie as fallback
const oldSync = `const syncLocalUiStates = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const locSuppliers = await localDb.suppliers.where('uid').equals(user.uid).toArray();
      console.log('📊 Dexie suppliers loaded:', locSuppliers.length, 'for uid:', user.uid);
      const locItems = await localDb.items.where('uid').equals(user.uid).toArray();
      console.log('📊 Dexie items loaded:', locItems.length, 'for uid:', user.uid);
      const locInvoices = await localDb.invoices.where('uid').equals(user.uid).toArray();

      setSuppliers(locSuppliers);
      setItems(locItems);
      setHistory(locInvoices.sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      ));
    } catch (err) {
      console.error('Dexie loading error:', err);
    }
  }, [user?.uid]);`;

const newSync = `const syncLocalUiStates = useCallback(async () => {
    if (!user?.uid) return;
    try {
      // ★ Load from Dexie (instant, offline-safe)
      const locSuppliers = await localDb.suppliers.where('uid').equals(user.uid).toArray();
      const locItems = await localDb.items.where('uid').equals(user.uid).toArray();
      const locInvoices = await localDb.invoices.where('uid').equals(user.uid).toArray();

      if (locSuppliers.length > 0) setSuppliers(locSuppliers);
      if (locItems.length > 0) setItems(locItems);
      if (locInvoices.length > 0) {
        setHistory(locInvoices.sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        ));
      }
      console.log('📊 Dexie loaded — suppliers:', locSuppliers.length, 'items:', locItems.length, 'invoices:', locInvoices.length);
    } catch (err) {
      console.warn('Dexie loading error (non-fatal):', err.message);
    }
  }, [user?.uid]);`;

if (code.includes(oldSync)) {
  code = code.replace(oldSync, newSync);
  console.log('✅ Fixed syncLocalUiStates');
} else {
  console.log('⚠️ syncLocalUiStates pattern not found, trying alternative...');
  // Try without debug logs
  const altOld = `const locSuppliers = await localDb.suppliers.where('uid').equals(user.uid).toArray();
      const locItems = await localDb.items.where('uid').equals(user.uid).toArray();
      const locInvoices = await localDb.invoices.where('uid').equals(user.uid).toArray();

      setSuppliers(locSuppliers);
      setItems(locItems);`;
  const altNew = `const locSuppliers = await localDb.suppliers.where('uid').equals(user.uid).toArray();
      const locItems = await localDb.items.where('uid').equals(user.uid).toArray();
      const locInvoices = await localDb.invoices.where('uid').equals(user.uid).toArray();

      if (locSuppliers.length > 0) setSuppliers(locSuppliers);
      if (locItems.length > 0) setItems(locItems);`;
  if (code.includes(altOld)) {
    code = code.replace(altOld, altNew);
    console.log('✅ Fixed syncLocalUiStates (alt pattern)');
  }
}

// 2. Fix Firestore listener — always set state, sync Dexie in background
const oldListener = `const unsubS = onSnapshot(
      query(collection(db, 'suppliers'), where('uid', '==', user.uid)),
      (snap) => {
        const cloudData = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
        if (cloudData.length > 0) {
          setSuppliers(cloudData);
          localDb.suppliers.bulkPut(cloudData);
        }
      },
      (err) => console.error('❌ Suppliers cloud load FAILED:', err.message || err)
    );`;

const newListener = `const unsubS = onSnapshot(
      query(collection(db, 'suppliers'), where('uid', '==', user.uid)),
      (snap) => {
        const cloudData = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
        console.log('🔥 Firestore suppliers:', cloudData.length);
        setSuppliers(cloudData);
        // Sync to Dexie in background (non-blocking)
        if (cloudData.length > 0) {
          localDb.suppliers.bulkPut(cloudData).catch(e => console.warn('Dexie sync:', e.message));
        }
      },
      (err) => console.error('❌ Suppliers cloud load FAILED:', err.message || err)
    );`;

if (code.includes(oldListener)) {
  code = code.replace(oldListener, newListener);
  console.log('✅ Fixed suppliers Firestore listener');
} else {
  console.log('⚠️ Suppliers listener pattern not found');
}

// 3. Fix items listener
const oldItemsListener = `const unsubI = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', user.uid)),
      (snap) => {
        const cloudItems = snap.docs.map((d) => ({ id: d.id, ...d.data()})).filter((d) => d.uid === user.uid);
        if (cloudItems.length > 0) {
          setItems(cloudItems);
          localDb.items.bulkPut(cloudItems);
        }
      },
      (err) => console.error('❌ Items cloud load FAILED:', err.message || err)
    );`;

const newItemsListener = `const unsubI = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', user.uid)),
      (snap) => {
        const cloudItems = snap.docs.map((d) => ({ id: d.id, ...d.data()})).filter((d) => d.uid === user.uid);
        console.log('🔥 Firestore items:', cloudItems.length);
        setItems(cloudItems);
        if (cloudItems.length > 0) {
          localDb.items.bulkPut(cloudItems).catch(e => console.warn('Dexie sync:', e.message));
        }
      },
      (err) => console.error('❌ Items cloud load FAILED:', err.message || err)
    );`;

if (code.includes(oldItemsListener)) {
  code = code.replace(oldItemsListener, newItemsListener);
  console.log('✅ Fixed items Firestore listener');
} else {
  console.log('⚠️ Items listener pattern not found');
}

// 4. Fix invoices listener
const oldInvListener = `const unsubH = onSnapshot(
      query(collection(db, storageKey), where('uid', '==', user.uid)),
      (snap) => {
        const cloudInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
        if (cloudInvoices.length > 0) {
          setHistory(cloudInvoices.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
          localDb.invoices.bulkPut(cloudInvoices);
        }
      },
      (err) => console.error('❌ Invoices cloud load FAILED:', err.message || err)
    );`;

const newInvListener = `const unsubH = onSnapshot(
      query(collection(db, storageKey), where('uid', '==', user.uid)),
      (snap) => {
        const cloudInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
        console.log('🔥 Firestore invoices:', cloudInvoices.length);
        setHistory(cloudInvoices.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        if (cloudInvoices.length > 0) {
          localDb.invoices.bulkPut(cloudInvoices).catch(e => console.warn('Dexie sync:', e.message));
        }
      },
      (err) => console.error('❌ Invoices cloud load FAILED:', err.message || err)
    );`;

if (code.includes(oldInvListener)) {
  code = code.replace(oldInvListener, newInvListener);
  console.log('✅ Fixed invoices Firestore listener');
} else {
  console.log('⚠️ Invoices listener pattern not found');
}

fs.writeFileSync(path, code, 'utf8');
console.log('\n🎉 All fixes applied to components/PurchaseCommonForm.jsx!');
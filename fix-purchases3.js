const fs = require('fs');
const path = 'components/PurchaseCommonForm.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Fix suppliers listener — remove length guard, add uid filter
code = code.replace(
  `unsubS = onSnapshot(
        query(collection(db, 'suppliers'), where('uid', '==', user.uid)),        (snap) => {
          const cloudData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (cloudData.length > 0) {
            setSuppliers(cloudData);
            localDb.suppliers.bulkPut(cloudData);
          }
        },`,
  `unsubS = onSnapshot(
        query(collection(db, 'suppliers'), where('uid', '==', user.uid)),
        (snap) => {
          const cloudData = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
          console.log('🔥 Firestore suppliers:', cloudData.length);
          setSuppliers(cloudData);
          if (cloudData.length > 0) localDb.suppliers.bulkPut(cloudData).catch(() => {});
        },`
);

// 2. Fix items listener
code = code.replace(
  `unsubI = onSnapshot(
        query(collection(db, 'items'), where('uid', '==', user.uid)),
        (snap) => {
          const cloudItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (cloudItems.length > 0) {
            setItems(cloudItems);
            localDb.items.bulkPut(cloudItems);
          }
        },`,
  `unsubI = onSnapshot(
        query(collection(db, 'items'), where('uid', '==', user.uid)),
        (snap) => {
          const cloudItems = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
          console.log('🔥 Firestore items:', cloudItems.length);
          setItems(cloudItems);
          if (cloudItems.length > 0) localDb.items.bulkPut(cloudItems).catch(() => {});
        },`
);

// 3. Fix invoices listener
code = code.replace(
  `unsubH = onSnapshot(
        query(collection(db, storageKey), where('uid', '==', user.uid)),
        (snap) => {
          const cloudInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (cloudInvoices.length > 0) {
            setHistory(cloudInvoices.sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            ));
            localDb.invoices.bulkPut(cloudInvoices);
          }
        },`,
  `unsubH = onSnapshot(
        query(collection(db, storageKey), where('uid', '==', user.uid)),
        (snap) => {
          const cloudInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);
          console.log('🔥 Firestore invoices:', cloudInvoices.length);
          setHistory(cloudInvoices.sort((a, b) =>
            (b.createdAt || '').localeCompare(a.createdAt || '')
          ));
          if (cloudInvoices.length > 0) localDb.invoices.bulkPut(cloudInvoices).catch(() => {});
        },`
);

fs.writeFileSync(path, code, 'utf8');
console.log('✅ All 3 listeners fixed!');
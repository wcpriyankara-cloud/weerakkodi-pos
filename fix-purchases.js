const fs = require('fs');
const path = 'catalog/components/PurchaseCommonForm.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add useUserAuth import (after React import)
if (!code.includes("useUserAuth")) {
  code = code.replace(
    "import React, { useState, useEffect, useMemo, useCallback, useRef } from'react';",
    "import React, { useState, useEffect, useMemo, useCallback, useRef } from'react';\nimport { useUserAuth } from '@/context/UserContext';"
  );
  console.log('✅ Added useUserAuth import');
}

// 2. Add const { user } = useUserAuth() inside component
if (!code.includes("const { user } = useUserAuth()")) {
  code = code.replace(
    "  storageKey = 'purchases',\n}) {",
    "  storageKey = 'purchases',\n}) {\n  const { user } = useUserAuth();"
  );
  console.log('✅ Added useUserAuth() hook');
}

// 3. Fix syncLocalUiStates — add uid filter to Dexie queries
code = code.replace(
  "const locSuppliers = await localDb.suppliers.toArray();",
  "const locSuppliers = user?.uid ? await localDb.suppliers.where('uid').equals(user.uid).toArray() : [];"
);
code = code.replace(
  "const locItems = await localDb.items.toArray();",
  "const locItems = user?.uid ? await localDb.items.where('uid').equals(user.uid).toArray() : [];"
);
code = code.replace(
  "const locInvoices = await localDb.invoices.toArray();",
  "const locInvoices = user?.uid ? await localDb.invoices.where('uid').equals(user.uid).toArray() : [];"
);
console.log('✅ Fixed Dexie queries with uid filter');

// 4. Fix syncLocalUiStates dependency
code = code.replace(
  "}, []);\n\n  useEffect(() => {\n    syncLocalUiStates();\n  }, [syncLocalUiStates]);",
  "}, [user?.uid]);\n\n  useEffect(() => {\n    syncLocalUiStates();\n  }, [syncLocalUiStates]);"
);
console.log('✅ Fixed syncLocalUiStates dependency');

// 5. Fix Firestore suppliers listener — add where('uid')
code = code.replace(
  "const unsubS = onSnapshot(\n      collection(db, 'suppliers'),",
  "const unsubS = onSnapshot(\n      query(collection(db, 'suppliers'), where('uid', '==', user.uid)),"
);
console.log('✅ Fixed Firestore suppliers query');

// 6. Fix Firestore items listener — add where('uid')
code = code.replace(
  "const unsubI = onSnapshot(\n      collection(db, 'items'),",
  "const unsubI = onSnapshot(\n      query(collection(db, 'items'), where('uid', '==', user.uid)),"
);
console.log('✅ Fixed Firestore items query');

// 7. Fix Firestore invoices listener — add where('uid')
code = code.replace(
  "const unsubH = onSnapshot(\n      collection(db, storageKey),",
  "const unsubH = onSnapshot(\n      query(collection(db, storageKey), where('uid', '==', user.uid)),"
);
console.log('✅ Fixed Firestore invoices query');

// 8. Add uid filter in Firestore callbacks (double-check safety)
code = code.replace(
  "const cloudData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));\n        if (cloudData.length > 0) {\n          setSuppliers(cloudData);",
  "const cloudData = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);\n        if (cloudData.length > 0) {\n          setSuppliers(cloudData);"
);
code = code.replace(
  "const cloudItems = snap.docs.map((d) => ({ id: d.id, ...d.data()}));\n        if (cloudItems.length > 0) {\n          setItems(cloudItems);",
  "const cloudItems = snap.docs.map((d) => ({ id: d.id, ...d.data()})).filter((d) => d.uid === user.uid);\n        if (cloudItems.length > 0) {\n          setItems(cloudItems);"
);
code = code.replace(
  "const cloudInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));\n        if (cloudInvoices.length > 0) {\n          setHistory(cloudInvoices",
  "const cloudInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.uid === user.uid);\n        if (cloudInvoices.length > 0) {\n          setHistory(cloudInvoices"
);
console.log('✅ Added double-check uid filter in callbacks');

// 9. Fix useEffect dependency — add user?.uid
code = code.replace(
  "}, [storageKey]);\n\n  useEffect(() => {\n    const handleBeforeUnload",
  "}, [storageKey, user?.uid]);\n\n  useEffect(() => {\n    const handleBeforeUnload"
);
console.log('✅ Fixed useEffect dependency array');

// 10. Add user-switch cleanup effect
if (!code.includes("Clear data on user switch")) {
  code = code.replace(
    "  useEffect(() => {\n    setBankLoading(true);",
    `  // ★ Clear data on user switch — prevents cross-user leakage
  useEffect(() => {
    setSuppliers([]);
    setItems([]);
    setHistory([]);
    setCart([]);
  }, [user?.uid]);

  useEffect(() => {
    setBankLoading(true);`
  );
  console.log('✅ Added user-switch cleanup effect');
}

// 11. Guard: skip listeners if no user
code = code.replace(
    "if (!db) return;\n    const unsubS = onSnapshot(",
    "if (!db || !user?.uid) return;\n    const unsubS = onSnapshot("
);
console.log('✅ Added user guard before listeners');

fs.writeFileSync(path, code, 'utf8');
console.log('\n🎉 All fixes applied successfully!');
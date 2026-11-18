const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');
let changes = 0;

// FIX 1: Live balance fetch - add offline check
const oldBalance = `let customerBalanceBefore = 0;
    if (isPersistedCustomer(selectedCustomer)) {
      try {
        const custSnap = await getDoc(doc(db, 'customers', selectedCustomer.id));`;

const newBalance = `let customerBalanceBefore = 0;
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isPersistedCustomer(selectedCustomer) && isOnline) {
      try {
        const custSnap = await Promise.race([getDoc(doc(db, 'customers', selectedCustomer.id)), new Promise((_,rj) => setTimeout(() => rj(new Error('timeout')), 4000))]);`;

if (c.includes(oldBalance)) {
  c = c.replace(oldBalance, newBalance);
  changes++;
  console.log('FIX 1 OK - Balance fetch: offline check + 4s timeout');
} else {
  // Try with \r\n
  const oldB2 = oldBalance.replace(/\n/g, '\r\n');
  const newB2 = newBalance.replace(/\n/g, '\r\n');
  if (c.includes(oldB2)) {
    c = c.replace(oldB2, newB2);
    changes++;
    console.log('FIX 1 OK (CRLF)');
  } else {
    const idx = c.indexOf('let customerBalanceBefore = 0;');
    if (idx !== -1) {
      console.log('Balance marker at', idx);
      console.log('NEARBY:', JSON.stringify(c.substring(idx, idx + 250)));
    }
  }
}

// FIX 2: Firestore batch - wrap with online check
const oldBatch = `// STEP 2: Try Firestore (may fail offline)
    let firestoreOk = false;
    try {
      const fbBatch = writeBatch(db);`;

const newBatch = `// STEP 2: Try Firestore (may fail offline)
    let firestoreOk = false;
    if (!isOnline) {
      console.log('[Offline] Skipping Firestore, Dexie only');
    } else try {
      const fbBatch = writeBatch(db);`;

if (c.includes(oldBatch)) {
  c = c.replace(oldBatch, newBatch);
  changes++;
  console.log('FIX 2 OK - Firestore batch: offline skip');
} else {
  const oldB2 = oldBatch.replace(/\n/g, '\r\n');
  const newB2 = newBatch.replace(/\n/g, '\r\n');
  if (c.includes(oldB2)) {
    c = c.replace(oldB2, newB2);
    changes++;
    console.log('FIX 2 OK (CRLF)');
  } else {
    const idx = c.indexOf('STEP 2: Try Firestore');
    if (idx !== -1) {
      console.log('STEP 2 marker at', idx);
      console.log('NEARBY:', JSON.stringify(c.substring(idx, idx + 200)));
    }
  }
}

if (changes > 0) {
  fs.writeFileSync(f, c, 'utf8');
  console.log('SAVED - ' + changes + ' fixes applied!');
} else {
  console.log('NO CHANGES - patterns not found');
}
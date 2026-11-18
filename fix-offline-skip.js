const fs = require('fs');
const f = 'C:/Users/chandana/StudioProjects/weerakkodi_pos_app/components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

// FIX 1: getDoc - skip entirely if offline
const oldGetDoc = "const custSnap = await Promise.race([getDoc(doc(db, 'customers', selectedCustomer.id)), new Promise((_,rej) => setTimeout(() => rej(new Error('getDoc timeout')), 3000))]);";
const newGetDoc = "const isOnline = navigator.onLine; let custSnap = null; if (isOnline) { try { custSnap = await Promise.race([getDoc(doc(db, 'customers', selectedCustomer.id)), new Promise((_,rej) => setTimeout(() => rej(new Error('getDoc timeout')), 3000))]); } catch(e) { console.warn('[Offline] getDoc skipped'); } }";
if (c.includes(oldGetDoc)) {
  c = c.replace(oldGetDoc, newGetDoc);
  console.log('FIX 1: getDoc offline skip applied');
} else {
  console.log('FIX 1: getDoc pattern not found, trying fallback');
  // Fallback: find any getDoc for customers and wrap it
  c = c.replace(
    /const custSnap = await Promise\.race\(\[getDoc\(doc\(db, 'customers', selectedCustomer\.id\)\)[^\]]+\]\);/,
    "const isOnline = navigator.onLine; let custSnap = null; if (isOnline) { try { custSnap = await Promise.race([getDoc(doc(db, 'customers', selectedCustomer.id)), new Promise((_,rej) => setTimeout(() => rej(new Error('getDoc timeout')), 3000))]); } catch(e) { console.warn('[Offline] getDoc skipped'); } }"
  );
}

// FIX 2: fbBatch.commit - skip entirely if offline
const oldBatch = 'await Promise.race([fbBatch.commit(), new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore timeout (offline)")), 5000))]);';
const newBatch = 'if (!navigator.onLine) throw new Error("offline-skip"); await Promise.race([fbBatch.commit(), new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore timeout")), 5000))]);';
if (c.includes(oldBatch)) {
  c = c.replace(oldBatch, newBatch);
  console.log('FIX 2: fbBatch offline skip applied');
} else {
  console.log('FIX 2: fbBatch pattern not found');
}

fs.writeFileSync(f, c, 'utf8');
console.log('Done!');

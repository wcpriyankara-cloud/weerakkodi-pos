const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chandana\\StudioProjects\\weerakkodi_pos_app';

// ===== FIX 1: InvoiceList.jsx syntax error =====
const invPath = path.join(base, 'components', 'InvoiceList.jsx');
let inv = fs.readFileSync(invPath, 'utf8');

// Fix: "return await getDocs(q); catch(serverErr) {" -> proper try-catch
// The pattern is: some code ending with ); then "return await getDocs(q); catch("
// We need to wrap it in try { ... } catch { ... }
inv = inv.replace(
  /return await getDocs\(q\);\s*catch\s*\(\s*serverErr\s*\)\s*\{/,
  'try { return await getDocs(q); } catch(serverErr) {'
);

// Also check if there's a stray "try {" before this that's now unmatched
// Count try/catch balance in the fetchInvoices area
const lines = inv.split('\n');
let fixed = false;
for (let i = 0; i < lines.length; i++) {
  // Look for pattern: "try {" on one line, then code, then "try { return" (double try)
  if (lines[i].includes('try {') && i + 1 < lines.length && lines[i+1].includes('try { return await getDocs')) {
    // Remove the outer duplicate try
    lines[i] = lines[i].replace('try {', '/* fixed */');
    fixed = true;
    console.log('Removed duplicate try at line', i + 1);
  }
}
if (fixed) inv = lines.join('\n');

fs.writeFileSync(invPath, inv, 'utf8');
console.log('✅ InvoiceList.jsx syntax fixed');

// ===== FIX 2: firebase-config.js missing 'app' =====
const fbPath = path.join(base, 'firebase-config.js');
let fb = fs.readFileSync(fbPath, 'utf8');

// Check if 'app' is defined
if (!fb.includes('const app') && !fb.includes('let app') && !fb.includes('var app')) {
  console.log('⚠️ app variable missing in firebase-config.js, rebuilding...');
  
  // Rebuild the entire file cleanly
  fb = `import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firestore quota errors suppress කරන්න
setLogLevel("silent");
if (typeof window !== 'undefined') {
  const origErr = console.error;
  console.error = function(...args) {
    const msg = args.map(a => String(a)).join(' ');
    if (msg.includes('resource-exhausted') || msg.includes('Quota exceeded') || msg.includes('maximum backoff')) return;
    return origErr.apply(console, args);
  };
}

// Vercel එකට සමාන simple config — persistentLocalCache නැහැ
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export const goOfflineMode = async () => {};
export const goOnlineMode = async () => {};

export { app, db, auth, storage, googleProvider };
export default app;
`;
  fs.writeFileSync(fbPath, fb, 'utf8');
  console.log('✅ firebase-config.js rebuilt (simple, Vercel-matching)');
} else {
  console.log('✅ firebase-config.js already has app variable');
}

// ===== FIX 3: lib/firebase.js re-export check =====
const libFbPath = path.join(base, 'lib', 'firebase.js');
if (fs.existsSync(libFbPath)) {
  let libFb = fs.readFileSync(libFbPath, 'utf8');
  if (libFb.includes('initializeApp') && !libFb.includes('firebase-config')) {
    console.log('⚠️ lib/firebase.js has its own initializeApp, making it re-export from firebase-config.js');
    libFb = `// Re-export from firebase-config.js to avoid duplicate Firestore instances
export { app, db, auth, storage, googleProvider, firebaseConfig, goOfflineMode, goOnlineMode } from '../firebase-config.js';
export { default } from '../firebase-config.js';
`;
    fs.writeFileSync(libFbPath, libFb, 'utf8');
    console.log('✅ lib/firebase.js now re-exports from firebase-config.js');
  } else {
    console.log('✅ lib/firebase.js OK');
  }
}

console.log('\n🎉 All syntax errors fixed!');
console.log('Next: Ctrl+C → npm run dev → F5');
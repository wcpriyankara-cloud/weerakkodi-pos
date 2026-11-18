const fs = require('fs');
let changes = 0;

// FIX 1: syncService.js - fix db import path
const sf = 'lib/syncService.js';
if (fs.existsSync(sf)) {
  let c = fs.readFileSync(sf, 'utf8');
  
  // Fix firebase import
  const oldFb = "import { auth, db } from '@/lib/firebase';";
  const newFb = "import { auth, db } from '@/shared/firebase-config';";
  if (c.includes(oldFb)) {
    c = c.replace(oldFb, newFb);
    changes++;
    console.log('FIX 1 OK - syncService.js: db import path fixed');
  } else if (c.includes(newFb)) {
    console.log('FIX 1 SKIP - already correct');
  } else {
    console.log('FIX 1 WARN - firebase import pattern different');
    const idx = c.indexOf("from '@/lib/firebase'");
    if (idx !== -1) {
      const lineStart = c.lastIndexOf('\n', idx) + 1;
      const lineEnd = c.indexOf('\n', idx);
      console.log('Found line:', c.substring(lineStart, lineEnd).trim());
    }
  }
  
  // Fix localDb import (named → default)
  const oldLdb = "import { localDb } from '@/lib/localDb';";
  const newLdb = "import localDb from '@/lib/localDb';";
  if (c.includes(oldLdb)) {
    c = c.replace(oldLdb, newLdb);
    changes++;
    console.log('FIX 2 OK - syncService.js: localDb import fixed');
  } else if (c.includes(newLdb)) {
    console.log('FIX 2 SKIP - localDb already default');
  } else {
    console.log('FIX 2 WARN - localDb import pattern different');
  }
  
  fs.writeFileSync(sf, c, 'utf8');
} else {
  console.log('syncService.js NOT FOUND at lib/');
}

// FIX 3: POSInvoice.jsx - add online event listener for auto sync + disk backup
const pf = 'components/POSInvoice.jsx';
if (fs.existsSync(pf)) {
  let c = fs.readFileSync(pf, 'utf8');
  
  if (c.includes('syncAllToDisk') || c.includes('online-sync-listener')) {
    console.log('FIX 3 SKIP - auto-sync already in POSInvoice');
  } else {
    // Add import for syncService
    if (!c.includes('syncAll') && !c.includes('syncService')) {
      const firstImport = c.indexOf('import ');
      if (firstImport !== -1) {
        const imp = "import { syncAll, triggerLocalDiskBackup as diskBackup } from '@/lib/syncService';\n";
        c = c.substring(0, firstImport) + imp + c.substring(firstImport);
        changes++;
        console.log('FIX 3a OK - Added syncService import');
      }
    }
    
    // Add online listener useEffect after first useEffect
    const marker = '/* ── Keyboard listeners ── */';
    if (c.includes(marker) && !c.includes('online-sync-listener')) {
      const syncBlock = `
  /* ── online-sync-listener: Firestore → Dexie → Disk ── */
  useEffect(() => {
    if (!user?.uid) return;
    const handleOnline = () => {
      console.log('[Online] Internet detected! Syncing Firestore → Dexie → Disk...');
      try { syncAll(user.uid); } catch(e) { console.warn('syncAll err:', e); }
      setTimeout(() => { try { diskBackup(user.uid); } catch(e) {} }, 5000);
    };
    window.addEventListener('online', handleOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(handleOnline, 8000);
    }
    return () => window.removeEventListener('online', handleOnline);
  }, [user?.uid]);

  `;
      c = c.replace(marker, syncBlock + marker);
      changes++;
      console.log('FIX 3b OK - Added online sync listener');
    }
    
    fs.writeFileSync(pf, c, 'utf8');
  }
}

console.log('\nTotal changes: ' + changes);
if (changes > 0) console.log('SAVED!');
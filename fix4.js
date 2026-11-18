const fs = require('fs');
const path = require('path');

const posPaths = [
  'app/(protected)/pos/page.js',
  'app/(protected)/pos/page.jsx',
  'app/pos/page.js',
  'app/pos/page.jsx',
  'pages/pos.js',
  'pages/pos.jsx'
];

let posFile = null;
for (const p of posPaths) {
  const full = path.join(__dirname, p);
  if (fs.existsSync(full)) {
    posFile = full;
    console.log('Found POS page:', p);
    break;
  }
}

if (!posFile) {
  const { execSync } = require('child_process');
  try {
    const result = execSync('Get-ChildItem -Recurse -Include page.js,page.jsx | Where-Object { $_.DirectoryName -match "pos" } | Select-Object -First 1 -ExpandProperty FullName', { shell: 'powershell', encoding: 'utf8' }).trim();
    if (result && fs.existsSync(result)) {
      posFile = result;
      console.log('Found POS page (search):', result);
    }
  } catch(e) {}
}

if (posFile) {
  const posCode = fs.readFileSync(posFile, 'utf8');
  const lines = posCode.split('\n');
  console.log('\n--- POS page item-related code ---');
  lines.forEach((line, i) => {
    if (line.match(/items|setItems|onSnapshot|getDocs|collection.*items|localDb/i)) {
      console.log('L' + (i+1) + ': ' + line.trim().substring(0, 120));
    }
  });
  console.log('---\n');
} else {
  console.log('POS page not found!');
}

const fbPath = path.join(__dirname, 'lib', 'firebase.js');
const fbNew = '// lib/firebase.js - Re-export from firebase-config.js (single db instance)\nexport { app, db, auth, storage, firebaseConfig } from "../firebase-config";\nexport { default } from "../firebase-config";\n';
fs.writeFileSync(fbPath, fbNew, 'utf8');
console.log('OK - lib/firebase.js: now re-exports from firebase-config.js');

const cfgPath = path.join(__dirname, 'firebase-config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8');
if (!cfg.includes('setLogLevel("silent")') && !cfg.includes("setLogLevel('silent')")) {
  if (!cfg.includes('setLogLevel')) {
    cfg = cfg.replace(
      'initializeFirestore, persistentLocalCache, persistentMultipleTabManager',
      'initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel'
    );
  }
  if (!cfg.includes('setLogLevel(')) {
    cfg = cfg.replace('const app =', 'setLogLevel("silent");\nconst app =');
  }
  fs.writeFileSync(cfgPath, cfg, 'utf8');
  console.log('OK - firebase-config.js: setLogLevel added');
} else {
  console.log('SKIP - setLogLevel already present');
}

console.log('\nDone!');
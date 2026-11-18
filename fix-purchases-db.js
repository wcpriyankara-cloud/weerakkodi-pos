const fs = require('fs');
const p = 'components/PurchaseCommonForm.jsx';
let code = fs.readFileSync(p, 'utf8');

code = code.replace("from'react'", "from 'react'");
code = code.replace(
  /import React, \{ useState, useEffect, useMemo, useCallback, useRef \} from\s*\nimport/,
  "import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';\nimport"
);

if (!code.includes("from '@/shared/firebase-config'")) {
  code = code.replace(
    "import { useUserAuth } from '@/context/UserContext';",
    "import { useUserAuth } from '@/context/UserContext';\nimport { db } from '@/shared/firebase-config';\nimport {\n  collection, addDoc, doc, updateDoc, deleteDoc, getDocs,\n  query, where, onSnapshot, serverTimestamp, writeBatch,\n  increment, Timestamp\n} from 'firebase/firestore';"
  );
}

const start = code.indexOf('let db = null;');
const marker = "import { cn, normalizeDate, formatCurrency }";
const end = code.indexOf(marker);
if (start !== -1 && end !== -1 && end > start) {
  code = code.slice(0, start) + code.slice(end);
}

code = code.replace(
  /try\s*\{\s*const firebaseMod = require\(['"]@\/firebaseConfig['"]\);[\s\S]*?console\.warn\('Firebase SDK offline mode:[\s\S]*?\}\s*/g,
  ''
);

fs.writeFileSync(p, code, 'utf8');

const after = fs.readFileSync(p, 'utf8');
console.log('===== FIRST 35 LINES =====');
console.log(after.split(/\n/).slice(0, 35).join('\n'));
console.log('\nlet db = null leftover:', after.includes('let db = null;'));
console.log('require @/firebaseConfig leftover:', after.includes("require('@/firebaseConfig')"));
console.log('shared/firebase-config import:', after.includes('@/shared/firebase-config'));

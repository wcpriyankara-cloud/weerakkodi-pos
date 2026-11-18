const fs = require('fs');

// 1. Fix items/page.js - add db import
let items = fs.readFileSync('app/(protected)/items/page.js', 'utf8');
if (!items.includes("from '@/lib/firebase'") && !items.includes('from "@/lib/firebase"')) {
  items = items.replace(
    "import localDb from '@/lib/localDb';",
    "import localDb from '@/lib/localDb';\nimport { db } from '@/lib/firebase';\nimport { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';"
  );
  fs.writeFileSync('app/(protected)/items/page.js', items, 'utf8');
  console.log('✅ items/page.js: db + firestore imports added');
} else {
  console.log('⏭️ items/page.js: already has db import');
}

// 2. Fix components/InvoiceList.jsx - add db import
let inv = fs.readFileSync('components/InvoiceList.jsx', 'utf8');
if (!inv.includes("from '../lib/firebase'") && !inv.includes('from "@/lib/firebase"') && !inv.includes("from '@/lib/firebase'")) {
  inv = inv.replace(
    'import { localDb } from "../lib/localDb";',
    'import { localDb } from "../lib/localDb";\nimport { db } from "../lib/firebase";\nimport { collection, getDocs, query, where, limit } from "firebase/firestore";'
  );
  fs.writeFileSync('components/InvoiceList.jsx', inv, 'utf8');
  console.log('✅ InvoiceList.jsx: db + firestore imports added');
} else {
  console.log('⏭️ InvoiceList.jsx: already has db import');
}

// Verify
console.log('\n--- Verification ---');
const v1 = fs.readFileSync('app/(protected)/items/page.js', 'utf8');
console.log('items/page.js has db:', v1.includes("db } from '@/lib/firebase'"));
const v2 = fs.readFileSync('components/InvoiceList.jsx', 'utf8');
console.log('InvoiceList.jsx has db:', v2.includes('db } from "../lib/firebase"'));

const fs = require('fs');
let inv = fs.readFileSync('components/InvoiceList.jsx', 'utf8');

// 1. Remove my added ESM imports
inv = inv.replace(
  'import { localDb } from "../lib/localDb";\nimport { db } from "../lib/firebase";\nimport { collection, getDocs, query, where, limit } from "firebase/firestore";',
  'import { localDb } from "../lib/localDb";'
);

// 2. Replace require() block with ESM imports
const oldBlock = `// Firebase imports with safe fallback for pure offline capability
let db, collection, getDocs, query, where, limit, writeBatch, doc;
try {
  const firestore = require("firebase/firestore");
  const firebaseApp = require("../lib/firebase");
  db = firebaseApp.db;
  collection = firestore.collection;
  getDocs = firestore.getDocs;
  query = firestore.query;
  where = firestore.where;
  limit = firestore.limit;
  writeBatch = firestore.writeBatch;
  doc = firestore.doc;
} catch (e) {
  console.warn("Firebase offline:", e);
}`;

const newBlock = `// Firebase imports (disableNetwork handles offline safety)
import { db } from "../lib/firebase";
import {
  collection, getDocs, query, where, limit,
  writeBatch, doc
} from "firebase/firestore";`;

if (inv.includes('safe fallback for pure offline')) {
  inv = inv.replace(oldBlock, newBlock);
  console.log('✅ Replaced require() block with ESM imports');
} else {
  console.log('⚠️ Block not found, trying regex...');
  inv = inv.replace(
    /\/\/ Firebase imports with safe fallback[\s\S]*?console\.warn\("Firebase offline:", e\);\s*\}/,
    newBlock
  );
  console.log('✅ Replaced via regex');
}

fs.writeFileSync('components/InvoiceList.jsx', inv, 'utf8');

// Verify
const lines = inv.split('\n');
for (let i = 19; i < 32 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

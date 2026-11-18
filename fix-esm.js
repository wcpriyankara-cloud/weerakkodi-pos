const fs = require('fs');
let items = fs.readFileSync('app/(protected)/items/page.js', 'utf8');

// Replace the entire require() block with proper ESM imports
const oldBlock = `/* ══════════════════════════════════════════
   SAFE FIREBASE IMPORTS — 100% OFFLINE SAFE
══════════════════════════════════════════ */
let db = null;
let collection, query, where, onSnapshot, deleteDoc, doc, setDoc;

try {
  const firebaseMod = require('@/lib/firebase');
  db = firebaseMod.db || null;
} catch (e) {
  console.warn('Firebase core offline:', e);
}

try {
  const firestore = require('firebase/firestore');
  collection = firestore.collection;
  query = firestore.query;
  where = firestore.where;
  onSnapshot = firestore.onSnapshot;
  deleteDoc = firestore.deleteDoc;
  doc = firestore.doc;
  setDoc = firestore.setDoc;
} catch (e) {
  console.warn('Firestore SDK offline:', e);
}`;

const newBlock = `// Firebase imports (disableNetwork handles offline safety)
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot,
  deleteDoc, doc, setDoc, getDocs
} from 'firebase/firestore';`;

if (items.includes('SAFE FIREBASE IMPORTS')) {
  items = items.replace(oldBlock, newBlock);
  fs.writeFileSync('app/(protected)/items/page.js', items, 'utf8');
  console.log('✅ Replaced require() block with ESM imports');
} else {
  console.log('⏭️ Block not found');
}

// Verify
const lines = items.split('\n');
for (let i = 8; i < 20 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

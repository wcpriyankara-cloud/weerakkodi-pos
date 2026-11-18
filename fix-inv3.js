const fs = require('fs');
let inv = fs.readFileSync('components/InvoiceList.jsx', 'utf8');

const startIdx = inv.indexOf('// Firebase imports with safe fallback');
const endIdx = inv.indexOf('InvoiceList running in offline mode.');
const closeBrace = inv.indexOf('}', endIdx);
const blockEnd = closeBrace + 1;

const newBlock = `// Firebase imports (disableNetwork handles offline safety)
import { db } from "../lib/firebase";
import {
  collection, getDocs, query, where, limit,
  writeBatch, doc
} from "firebase/firestore";`;

inv = inv.slice(0, startIdx) + newBlock + inv.slice(blockEnd);
fs.writeFileSync('components/InvoiceList.jsx', inv, 'utf8');
console.log('✅ Replaced successfully');

const lines = inv.split('\n');
for (let i = 20; i < 38 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

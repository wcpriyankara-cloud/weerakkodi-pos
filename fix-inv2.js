const fs = require('fs');
let inv = fs.readFileSync('components/InvoiceList.jsx', 'utf8');

// Find and replace the require block using markers
const startMarker = '// Firebase imports with safe fallback';
const endMarker = 'console.warn("Firebase offline:", e);';

const startIdx = inv.indexOf(startMarker);
const endIdx = inv.indexOf(endMarker);

if (startIdx >= 0 && endIdx >= 0) {
  // Find the closing } after the warn line
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
  console.log('✅ Replaced require() block successfully');
} else {
  console.log(`⚠️ Markers not found: start=${startIdx}, end=${endIdx}`);
}

// Verify
const lines = inv.split('\n');
for (let i = 19; i < 35 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

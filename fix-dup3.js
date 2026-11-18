const fs = require('fs');

// Remove the duplicate ESM imports I added to items/page.js
let items = fs.readFileSync('app/(protected)/items/page.js', 'utf8');
items = items.replace(
  "import localDb from '@/lib/localDb';\nimport { db } from '@/lib/firebase';\nimport { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';",
  "import localDb from '@/lib/localDb';"
);
fs.writeFileSync('app/(protected)/items/page.js', items, 'utf8');
console.log('✅ Removed duplicate imports from items/page.js');

// Verify
const lines = items.split('\n');
for (let i = 8; i < 35 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

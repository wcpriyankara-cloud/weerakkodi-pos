const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chandana\\StudioProjects\\weerakkodi_pos_app';

const invPath = path.join(base, 'components', 'InvoiceList.jsx');
let inv = fs.readFileSync(invPath, 'utf8');

// Step 1: Show the actual code around the problem areas
const lines = inv.split('\n');
console.log('=== LINES 60-90 (fetchInvoices start) ===');
for (let i = 59; i < Math.min(90, lines.length); i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
console.log('\n=== LINES 140-200 (cloud fetch area) ===');
for (let i = 139; i < Math.min(200, lines.length); i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Step 2: Find ALL occurrences of "offline mode" and "Timeout"
console.log('\n=== ALL "offline" and "Timeout" occurrences ===');
lines.forEach((line, i) => {
  if (line.includes('offline') || line.includes('Timeout') || line.includes('timeout') || line.includes('navigator.onLine') || line.includes('Promise.race')) {
    console.log(`${i+1}: ${line.trim()}`);
  }
});

// Step 3: Find the exact fetchInvoices function boundaries
let funcStart = -1, funcEnd = -1, braceCount = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('fetchInvoices') && (lines[i].includes('async') || lines[i].includes('const') || lines[i].includes('function'))) {
    funcStart = i;
    braceCount = 0;
  }
  if (funcStart >= 0) {
    braceCount += (lines[i].match(/\{/g) || []).length;
    braceCount -= (lines[i].match(/\}/g) || []).length;
    if (braceCount === 0 && i > funcStart) {
      funcEnd = i;
      break;
    }
  }
}
console.log(`\nfetchInvoices function: lines ${funcStart+1} to ${funcEnd+1}`);
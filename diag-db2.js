const fs = require('fs');
const path = require('path');

function findFiles(dir, name) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'src_OLD') continue;
    if (e.isDirectory()) results = results.concat(findFiles(full, name));
    else if (e.name === name) results.push(full);
  }
  return results;
}

// Find items page
const itemPages = findFiles('app', 'page.js').concat(findFiles('app', 'page.jsx'))
  .filter(f => f.includes('item'));
console.log('=== Items pages ===');
itemPages.forEach(f => console.log(f));

// Find InvoiceList
const invoiceLists = findFiles('.', 'InvoiceList.jsx');
console.log('\n=== InvoiceList files ===');
invoiceLists.forEach(f => console.log(f));

// Show db imports in each
[...itemPages, ...invoiceLists].forEach(f => {
  if (!fs.existsSync(f)) return;
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  console.log(`\n--- ${f} (db/firestore imports) ---`);
  lines.forEach((line, i) => {
    if (line.includes('import') && (line.includes('db') || line.includes('firebase') || line.includes('firestore') || line.includes('localDb'))) {
      console.log(`  ${i+1}: ${line.trim()}`);
    }
  });
  // Show line 149 area for items page
  if (f.includes('item')) {
    console.log(`  Lines 145-155:`);
    for (let i = 144; i < 155 && i < lines.length; i++) {
      console.log(`    ${i+1}: ${lines[i]}`);
    }
  }
  // Show line 161 area for InvoiceList
  if (f.includes('InvoiceList')) {
    console.log(`  Lines 155-170:`);
    for (let i = 154; i < 170 && i < lines.length; i++) {
      console.log(`    ${i+1}: ${lines[i]}`);
    }
  }
});

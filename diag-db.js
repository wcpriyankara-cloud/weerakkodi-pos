const fs = require('fs');
const files = [
  'app/(dashboard)/items/page.js',
  'app/(dashboard)/items/page.jsx',
  'components/InvoiceList.jsx'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    console.log(`\n=== ${f} (imports) ===`);
    lines.forEach((line, i) => {
      if (line.includes('import') && (line.includes('db') || line.includes('firebase') || line.includes('firestore'))) {
        console.log(`  ${i+1}: ${line.trim()}`);
      }
    });
  }
});

// Also check lib/firebase.js db export
console.log('\n=== lib/firebase.js ===');
console.log(fs.readFileSync('lib/firebase.js', 'utf8'));

const fs = require('fs');
let f = fs.readFileSync('components/Suppliers.jsx', 'utf8');

// Fix literal \n in imports
const fixed = f.replace(/\\n/g, '\n');
fs.writeFileSync('components/Suppliers.jsx', fixed, 'utf8');
console.log('✅ Fixed literal \\n in Suppliers.jsx');

// Show the fixed area
const lines = fixed.split('\n');
for (let i = 9; i < 20 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all page files in app/ directory (NOT .next)
console.log('=== Searching for POS page ===');
try {
  const r1 = execSync('Get-ChildItem -Path "app" -Recurse -Include "page.js","page.jsx" | Where-Object { $_.FullName -match "pos" } | Select-Object -ExpandProperty FullName', { shell: 'powershell', encoding: 'utf8' });
  console.log(r1 || 'No POS page found in app/');
} catch(e) { console.log('Search error:', e.message); }

console.log('\n=== Searching for items page ===');
try {
  const r2 = execSync('Get-ChildItem -Path "app" -Recurse -Include "page.js","page.jsx" | Where-Object { $_.FullName -match "items" } | Select-Object -ExpandProperty FullName', { shell: 'powershell', encoding: 'utf8' });
  console.log(r2 || 'No items page found in app/');
} catch(e) { console.log('Search error:', e.message); }

console.log('\n=== All route directories in app/ ===');
try {
  const r3 = execSync('Get-ChildItem -Path "app" -Recurse -Directory | Where-Object { (Get-ChildItem $_.FullName -Filter "page.*").Count -gt 0 } | Select-Object -ExpandProperty FullName', { shell: 'powershell', encoding: 'utf8' });
  console.log(r3);
} catch(e) { console.log('Search error:', e.message); }

// Also check components for POS
console.log('\n=== POS-related components ===');
try {
  const r4 = execSync('Get-ChildItem -Path "components" -Recurse -Include "*.js","*.jsx" | Where-Object { $_.Name -match "pos|cart|checkout" } | Select-Object -ExpandProperty FullName', { shell: 'powershell', encoding: 'utf8' });
  console.log(r4 || 'None found');
} catch(e) { console.log('Search error:', e.message); }
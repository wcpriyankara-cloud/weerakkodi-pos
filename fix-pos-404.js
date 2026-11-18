const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\chandana\\StudioProjects\\weerakkodi_pos_app';

// Check POS page file
const posPath = path.join(base, 'app', '(dashboard)', 'pos', 'page.jsx');
const posPathJs = path.join(base, 'app', '(dashboard)', 'pos', 'page.js');
const posPathTsx = path.join(base, 'app', '(dashboard)', 'pos', 'page.tsx');

console.log('=== POS Page File Check ===');
console.log('page.jsx exists:', fs.existsSync(posPath));
console.log('page.js exists:', fs.existsSync(posPathJs));
console.log('page.tsx exists:', fs.existsSync(posPathTsx));

// Check dashboard layout
const layoutPath = path.join(base, 'app', '(dashboard)', 'layout.js');
const layoutJsx = path.join(base, 'app', '(dashboard)', 'layout.jsx');
console.log('\n=== Dashboard Layout ===');
console.log('layout.js exists:', fs.existsSync(layoutPath));
console.log('layout.jsx exists:', fs.existsSync(layoutJsx));

// Check all routes in (dashboard)
const dashDir = path.join(base, 'app', '(dashboard)');
if (fs.existsSync(dashDir)) {
  const items = fs.readdirSync(dashDir);
  console.log('\n=== (dashboard) contents ===');
  items.forEach(item => {
    const fullPath = path.join(dashDir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const subItems = fs.readdirSync(fullPath);
      console.log(`  📁 ${item}/ → ${subItems.join(', ')}`);
    } else {
      console.log(`  📄 ${item}`);
    }
  });
}

// If POS page exists, check for syntax errors
const actualPosPath = fs.existsSync(posPath) ? posPath : fs.existsSync(posPathJs) ? posPathJs : null;
if (actualPosPath) {
  const content = fs.readFileSync(actualPosPath, 'utf8');
  console.log(`\n=== POS Page (${path.basename(actualPosPath)}) ===`);
  console.log('Size:', content.length, 'bytes');
  console.log('Lines:', content.split('\n').length);
  console.log('Has default export:', content.includes('export default'));
  
  // Check for common syntax issues
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  console.log('Braces: { =', openBraces, '} =', closeBraces, openBraces === closeBraces ? '✅' : '❌ MISMATCH');
  console.log('Parens: ( =', openParens, ') =', closeParens, openParens === closeParens ? '✅' : '❌ MISMATCH');
  
  // Check first and last 5 lines
  const lines = content.split('\n');
  console.log('\nFirst 5 lines:');
  lines.slice(0, 5).forEach((l, i) => console.log(`  ${i+1}: ${l}`));
  console.log('Last 5 lines:');
  lines.slice(-5).forEach((l, i) => console.log(`  ${lines.length-4+i}: ${l}`));
} else {
  console.log('\n❌ POS page file NOT FOUND!');
  console.log('Checking if pos directory exists...');
  const posDir = path.join(base, 'app', '(dashboard)', 'pos');
  console.log('pos dir exists:', fs.existsSync(posDir));
  if (fs.existsSync(posDir)) {
    console.log('pos dir contents:', fs.readdirSync(posDir));
  }
}

// Also check if there's a build error in InvoiceList that might break all routes
const invPath = path.join(base, 'components', 'InvoiceList.jsx');
if (fs.existsSync(invPath)) {
  const inv = fs.readFileSync(invPath, 'utf8');
  const openBraces = (inv.match(/\{/g) || []).length;
  const closeBraces = (inv.match(/\}/g) || []).length;
  console.log('\n=== InvoiceList.jsx Syntax Check ===');
  console.log('Braces: { =', openBraces, '} =', closeBraces, openBraces === closeBraces ? '✅' : '❌ MISMATCH');
  
  // Check for the paginated code
  console.log('Has paginated fetch:', inv.includes('BATCH_SIZE'));
  console.log('Has startAfter:', inv.includes('startAfter'));
  console.log('Has orderBy:', inv.includes('orderBy'));
}
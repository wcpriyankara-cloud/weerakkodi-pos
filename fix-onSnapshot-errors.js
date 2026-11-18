const fs = require('fs');
const path = require('path');

function findMatchingParen(str, start) {
  let depth = 0;
  let inStr = false;
  let strChar = '';
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    const prev = i > 0 ? str[i-1] : '';
    if (inStr) {
      if (ch === strChar && prev !== '\\') inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strChar = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function countTopLevelCommas(str) {
  let count = 0, depth = 0, inStr = false, strChar = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const prev = i > 0 ? str[i-1] : '';
    if (inStr) { if (ch === strChar && prev !== '\\') inStr = false; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strChar = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) count++;
  }
  return count;
}

function patchFile(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ ${fileName}: File not found`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let patches = [];
  
  // Find all onSnapshot calls using regex (handles spaces)
  const regex = /\bonSnapshot\s*\(/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen === -1) continue;
    
    const inner = content.slice(openParen + 1, closeParen);
    const topLevelCommas = countTopLevelCommas(inner);
    const lineNum = content.slice(0, match.index).split('\n').length;
    
    console.log(`  📍 ${fileName} line ${lineNum}: onSnapshot with ${topLevelCommas} top-level args`);
    
    if (topLevelCommas < 2) {
      // No error handler — add one
      patches.push({
        pos: closeParen,
        insert: ',\n    (error) => {\n      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);\n      if (error?.code === "resource-exhausted") {\n        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");\n      }\n    }\n  '
      });
    }
  }
  
  // Apply patches in reverse order
  patches.reverse();
  for (const p of patches) {
    content = content.slice(0, p.pos) + p.insert + content.slice(p.pos);
  }
  
  if (patches.length > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✅ ${fileName}: ${patches.length} error handlers added\n`);
  } else {
    console.log(`  ℹ️ ${fileName}: All onSnapshot calls already have error handlers\n`);
  }
}

console.log('🔧 onSnapshot error handlers patching...\n');

// Patch all relevant files
const files = [
  ['components/PurchaseCommonForm.jsx', 'PurchaseCommonForm'],
  ['components/Suppliers.jsx', 'Suppliers'],
  ['app/(protected)/items/page.js', 'Items Page'],
  ['components/Customers.jsx', 'Customers'],
];

for (const [file, name] of files) {
  patchFile(path.join(__dirname, file), name);
}

// Also search for any other files with onSnapshot
const { execSync } = require('child_process');
try {
  const result = execSync(
    'powershell -Command "Get-ChildItem -Recurse -Include *.jsx,*.js | Where-Object { $_.FullName -notmatch \'node_modules|\\.next|src_OLD|catalog\' } | Select-String -Pattern \'onSnapshot\' | ForEach-Object { $_.Path } | Select-Object -Unique"',
    { cwd: __dirname, encoding: 'utf8' }
  );
  const extraFiles = result.trim().split('\n').filter(f => f && !files.some(([known]) => f.includes(known)));
  for (const f of extraFiles) {
    const relPath = path.relative(__dirname, f.trim());
    if (relPath && !relPath.startsWith('..')) {
      console.log(`  🔍 Extra file found: ${relPath}`);
      patchFile(f.trim(), relPath);
    }
  }
} catch (e) {
  // Ignore search errors
}

console.log('✅ Done!');

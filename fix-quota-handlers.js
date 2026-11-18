const fs = require('fs');
const path = require('path');

// onSnapshot calls වලට error handler එකක් එකතු කරන function එක
function addErrorHandlers(content, fileName) {
  let result = '';
  let i = 0;
  let patchCount = 0;

  while (i < content.length) {
    const idx = content.indexOf('onSnapshot(', i);
    if (idx === -1) {
      result += content.slice(i);
      break;
    }

    result += content.slice(i, idx + 'onSnapshot('.length);
    i = idx + 'onSnapshot('.length;

    // Matching closing parenthesis සොයන්න
    let depth = 1;
    let j = i;
    while (j < content.length && depth > 0) {
      if (content[j] === '(') depth++;
      else if (content[j] === ')') depth--;
      j++;
    }

    const inner = content.slice(i, j - 1);

    // Top-level commas ගණන් කරන්න (arguments count check)
    let commaCount = 0;
    let d = 0;
    let inStr = false;
    let strChar = '';
    for (let k = 0; k < inner.length; k++) {
      const ch = inner[k];
      if (inStr) {
        if (ch === strChar && inner[k-1] !== '\\') inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strChar = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') d++;
      else if (ch === ')' || ch === ']' || ch === '}') d--;
      else if (ch === ',' && d === 0) commaCount++;
    }

    if (commaCount < 2) {
      // Error handler නැත — එකතු කරන්න
      const trimmed = inner.trimEnd();
      result += trimmed + ',\n    (error) => {\n      console.warn("⚠️ Firestore listener error:", error.code, error.message);\n      if (error.code === "resource-exhausted") {\n        console.warn("📊 Firestore quota exceeded — offline data පමණක් භාවිතා වේ");\n      }\n    }\n  ';
      patchCount++;
    } else {
      result += inner;
    }

    result += ')';
    i = j;
  }

  if (patchCount > 0) {
    console.log(`  ✅ ${fileName}: ${patchCount} onSnapshot calls patched`);
  } else {
    console.log(`  ℹ️ ${fileName}: No changes needed`);
  }
  return result;
}

// Patch කළ යුතු files
const filesToPatch = [
  'components/PurchaseCommonForm.jsx',
  'components/Suppliers.jsx',
  'app/(protected)/items/page.js',
];

console.log('🔧 onSnapshot error handlers එකතු කරමින්...\n');

for (const file of filesToPatch) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠️ File not found: ${file}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const updated = addErrorHandlers(content, file);
  if (updated !== content) {
    fs.writeFileSync(fullPath, updated, 'utf8');
  }
}

// POS page එකත් check කරන්න
const posFiles = [
  'app/(dashboard)/pos/page.jsx',
  'app/(dashboard)/pos/page.js',
  'app/(protected)/pos/page.jsx',
  'app/(protected)/pos/page.js',
];
for (const file of posFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('onSnapshot(')) {
      const updated = addErrorHandlers(content, file);
      if (updated !== content) {
        fs.writeFileSync(fullPath, updated, 'utf8');
      }
    }
  }
}

// Customers page එකත් check කරන්න
const custFiles = [
  'app/(dashboard)/customers/page.jsx',
  'app/(dashboard)/customers/page.js',
  'components/Customers.jsx',
];
for (const file of custFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('onSnapshot(')) {
      const updated = addErrorHandlers(content, file);
      if (updated !== content) {
        fs.writeFileSync(fullPath, updated, 'utf8');
      }
    }
  }
}

console.log('\n✅ Done! App එක restart කරන්න.');

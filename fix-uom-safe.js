const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'components', 'POSInvoice.jsx');
let code = fs.readFileSync(filePath, 'utf8');
let n = 0;

// 1. getBaseUnit - uom/uomName add
const r1 = /const getBaseUnit\s*=\s*\(item\)\s*=>\s*[^;]+;/;
if (r1.test(code)) {
  code = code.replace(r1,
    "const getBaseUnit = (item) => item?.uom || item?.uomName || item?.baseUnit || item?.unit || 'unit';"
  );
  n++; console.log('1. getBaseUnit OK');
} else { console.log('1. getBaseUnit SKIP'); }

// 2. getItemAvailableUnits - availableUnits add
const r2 = /const getItemAvailableUnits\s*=\s*\(item\)\s*=>\s*\{[\s\S]*?return \[\];\s*\};/;
if (r2.test(code)) {
  code = code.replace(r2,
    "const getItemAvailableUnits = (item) => {\n" +
    "  if (!item) return [];\n" +
    "  if (Array.isArray(item.availableUnits) && item.availableUnits.length > 0) return item.availableUnits;\n" +
    "  if (Array.isArray(item.uomConversions) && item.uomConversions.length > 0) return item.uomConversions;\n" +
    "  if (Array.isArray(item.units) && item.units.length > 0) return item.units;\n" +
    "  return [];\n" +
    "};"
  );
  n++; console.log('2. getItemAvailableUnits OK');
} else { console.log('2. getItemAvailableUnits SKIP'); }

// 3. getConvRate - factor add
const r3 = /const getConvRate\s*=\s*\(conv\)\s*=>\s*\{[\s\S]*?return r > 0 \? r : 1;\s*\};/;
if (r3.test(code)) {
  code = code.replace(r3,
    "const getConvRate = (conv) => {\n" +
    "  if (!conv) return 1;\n" +
    "  const r = parseFloat(conv.factor || conv.rate || conv.conversionRate || 1);\n" +
    "  return r > 0 ? r : 1;\n" +
    "};"
  );
  n++; console.log('3. getConvRate OK');
} else { console.log('3. getConvRate SKIP'); }

fs.writeFileSync(filePath, code, 'utf8');
console.log('\nDone! ' + n + '/3 fixes applied.');
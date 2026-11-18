const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'POSInvoice.jsx');
let code = fs.readFileSync(filePath, 'utf8');
let changes = 0;

// 1. Fix getBaseUnit - add uom and uomName
const r1 = /const getBaseUnit\s*=\s*\(item\)\s*=>\s*[^;]+;/;
if (r1.test(code)) {
  code = code.replace(r1,
    "const getBaseUnit = (item) => {\n" +
    "  if (!item) return 'unit';\n" +
    "  return item.uom || item.uomName || item.baseUnit || item.unit || 'unit';\n" +
    "};"
  );
  changes++;
  console.log('1. getBaseUnit fixed');
} else { console.log('1. getBaseUnit - pattern not found'); }

// 2. Fix getItemAvailableUnits - add availableUnits
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
  changes++;
  console.log('2. getItemAvailableUnits fixed');
} else { console.log('2. getItemAvailableUnits - pattern not found'); }

// 3. Fix getConvRate - prioritize factor
const r3 = /const getConvRate\s*=\s*\(conv\)\s*=>\s*\{[\s\S]*?return r > 0 \? r : 1;\s*\};/;
if (r3.test(code)) {
  code = code.replace(r3,
    "const getConvRate = (conv) => {\n" +
    "  if (!conv) return 1;\n" +
    "  const r = parseFloat(conv.factor || conv.rate || conv.conversionRate || 1);\n" +
    "  return r > 0 ? r : 1;\n" +
    "};"
  );
  changes++;
  console.log('3. getConvRate fixed');
} else { console.log('3. getConvRate - pattern not found'); }

// 4. Fix updateItemField uom case - recalculate price/qty on UOM switch
const r4 = /(if\s*\(\s*field\s*===\s*['"]uom['"]\s*\)\s*\{)([\s\S]*?)(return;\s*\})/;
if (r4.test(code)) {
  const newUomHandler =
    "if (field === 'uom') {\n" +
    "      const curItem = invoiceItems[idx]?.item;\n" +
    "      const baseU = getBaseUnit(curItem);\n" +
    "      const units = getItemAvailableUnits(curItem);\n" +
    "      const oldUom = invoiceItems[idx].uom || baseU;\n" +
    "      const newUom = value;\n" +
    "      const getF = (u) => {\n" +
    "        if (u === baseU) return 1;\n" +
    "        const c = units.find(x => x.toUnitName === u);\n" +
    "        return c ? getConvRate(c) : 1;\n" +
    "      };\n" +
    "      const oldF = getF(oldUom);\n" +
    "      const newF = getF(newUom);\n" +
    "      const oldQty = parseFloat(invoiceItems[idx].qty) || 0;\n" +
    "      const baseQty = oldQty / oldF;\n" +
    "      const newQty = baseQty * newF;\n" +
    "      const pType = invoiceItems[idx].priceType || 'retail';\n" +
    "      const basePrice = getYourPrice(curItem, pType);\n" +
    "      const newPrice = newF > 0 ? basePrice / newF : basePrice;\n" +
    "      setInvoiceItems(prev => prev.map((it, i) => i === idx ? {\n" +
    "        ...it, uom: newUom, qty: Math.round(newQty * 1000) / 1000,\n" +
    "        sellingPrice: Math.round(newPrice * 100) / 100,\n" +
    "        yourPrice: Math.round(newPrice * 100) / 100,\n" +
    "        uomFactor: newF\n" +
    "      } : it));\n" +
    "      return;";
  code = code.replace(r4, newUomHandler);
  changes++;
  console.log('4. updateItemField uom handler fixed');
} else { console.log('4. updateItemField uom - pattern not found (may need manual fix)'); }

fs.writeFileSync(filePath, code, 'utf8');
console.log('\nDone! ' + changes + ' changes applied.');
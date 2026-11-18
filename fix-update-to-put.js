const fs = require('fs');
let pos = fs.readFileSync('components/POSInvoice.jsx', 'utf8');

const oldUpdate = 'await localDb.items.update(itemId, { stock: newStock, currentStock: newStock, _synced: false });';
const newPut = 'await localDb.items.put({ ...item, stock: newStock, currentStock: newStock, _synced: false });';

const count = pos.split(oldUpdate).length - 1;
pos = pos.split(oldUpdate).join(newPut);
fs.writeFileSync('components/POSInvoice.jsx', pos, 'utf8');
console.log('Replaced', count, 'occurrences of update -> put');

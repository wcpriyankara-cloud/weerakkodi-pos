import Dexie from 'dexie';

export const localDb = new Dexie('WeerakkodiPOS_LocalDB');

localDb.version(1).stores({
  items: 'id, name, itemCode, barcode, uid, stock, quantity',
  customers: 'id, name, phone, uid, balance',
  invoices: 'id, invoiceNo, localId, synced, createdAt, date',
  drafts: 'id, invoiceNo, localId, createdAt'
});

export const db = localDb;
export const dexieDb = localDb;
export default localDb;

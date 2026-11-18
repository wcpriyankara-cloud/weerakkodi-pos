const fs = require('fs');

// ── 1. localDb.js ──
fs.writeFileSync('lib/localDb.js', `import Dexie from 'dexie';

export const localDb = new Dexie('WeerakkodiPOS_DB');

localDb.version(6).stores({
  customers: 'id, uid, name, phone, currentBalance, synced, createdAt, updatedAt',
  invoices: 'id, invoiceNo, uid, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
  purchases: 'id, uid, supplierId, invoiceNo, grandTotal, paidAmount, balance, paymentMethod, status, synced, createdAt',
  items: 'id, uid, name, barcode, sellingPrice, costPrice, quantity, synced, updatedAt',
  suppliers: 'id, uid, name, phone, email, currentBalance, synced, createdAt, updatedAt',
  customerLoans: 'id, uid, customerId, invoiceId, amount, date, type, status, synced',
  cashTransactions: 'id, uid, type, amount, description, date, synced, createdAt, invoiceId',
  payments: 'id, uid, invoiceId, supplierId, amount, date, synced, createdAt',
  settings: 'id, uid, userId',
});

export default localDb;
`, 'utf8');
console.log('1. localDb.js OK (purchases table v6)');

// ── 2. PurchaseCommonForm.jsx ──
const pcf = 'components/PurchaseCommonForm.jsx';
let code = fs.readFileSync(pcf, 'utf8');

const n1 = (code.match(/localDb\.invoices/g) || []).length;
code = code.replace(/localDb\.invoices/g, 'localDb.purchases');
console.log('2a. localDb.invoices -> localDb.purchases :', n1);

const n2 = (code.match(/invoices_\$\{user\.uid\}\.json/g) || []).length;
code = code.replace(/invoices_\$\{user\.uid\}\.json/g, 'purchases_${user.uid}.json');
console.log('2b. hard-disc invoices_*.json -> purchases_*.json :', n2);

if (!code.includes('function toSortKey') && !code.includes('const toSortKey')) {
  code = code.replace(
    'const R2 = (v) => Math.round((Number(v) || 0) * 100) / 100;',
    `const R2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const toSortKey = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v).padStart(15, '0');
  if (v.seconds) return String(v.seconds).padStart(15, '0');
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  return String(v);
};`
  );
  console.log('2c. toSortKey added');
} else {
  console.log('2c. toSortKey already present');
}

code = code.replace(
  /\(b\.createdAt \|\| ''\)\.localeCompare\(a\.createdAt \|\| ''\)/g,
  'toSortKey(b.createdAt).localeCompare(toSortKey(a.createdAt))'
);

fs.writeFileSync(pcf, code, 'utf8');
console.log('2d. leftover localDb.invoices:', (code.match(/localDb\.invoices/g) || []).length);

// ── 3. Suppliers.jsx — offline + hard disc ──
const supPath = 'components/Suppliers.jsx';
if (fs.existsSync(supPath)) {
  let sup = fs.readFileSync(supPath, 'utf8');

  if (!sup.includes("from '@/lib/localDb'") && !sup.includes('from "@/lib/localDb"')) {
    sup = sup.replace(
      'import { useUserAuth } from "@/context/UserContext";',
      'import { useUserAuth } from "@/context/UserContext";\nimport localDb from "@/lib/localDb";'
    );
    console.log('3a. localDb import added');
  } else {
    console.log('3a. localDb import already present');
  }

  const start = sup.indexOf('function useSuppliers(user)');
  const end = sup.indexOf('function useBanks(user)');
  if (start !== -1 && end !== -1 && end > start) {
    const newHook = `function useSuppliers(user) {
  const [suppliers, setSup] = useState([]);
  const [loading, setL] = useState(true);
  const [error, setE] = useState(null);
  useEffect(() => {
    if (!user?.uid) { setL(false); setSup([]); return; }
    const uid = user.uid;
    let cancelled = false;

    localDb.suppliers.where('uid').equals(uid).toArray()
      .then((rows) => {
        if (!cancelled && rows.length > 0) {
          setSup(rows.filter((r) => r.uid === uid).sort((a, b) => getTS(b) - getTS(a)));
          setL(false);
        }
      })
      .catch(() => {});

    const u = onSnapshot(
      query(collection(db, "suppliers"), where("uid", "==", uid)),
      (s) => {
        if (cancelled) return;
        const data = s.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.uid === uid)
          .sort((a, b) => getTS(b) - getTS(a));
        setSup(data);
        setL(false);
        setE(null);
        localDb.suppliers.bulkPut(data).catch(() => {});
        if (window.electronAPI && window.electronAPI.saveLocalData) {
          window.electronAPI.saveLocalData('suppliers_' + uid + '.json', data).catch(() => {});
        }
      },
      (e) => { if (!cancelled) { setE(e.message); setL(false); } }
    );
    return () => { cancelled = true; u(); };
  }, [user?.uid]);
  return { suppliers, loading, error };
}

`;
    sup = sup.slice(0, start) + newHook + sup.slice(end);
    console.log('3b. useSuppliers hook replaced');
  } else {
    console.log('3b. useSuppliers hook markers not found');
  }

  fs.writeFileSync(supPath, sup, 'utf8');
  console.log('3c. Suppliers.jsx saved');
} else {
  console.log('3. components/Suppliers.jsx not found');
}

console.log('\\nDONE');

import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { useUserAuth } from "../context/UserContext";
import dexieDb from "@/lib/dexieDB";
import { 
  collection, 
  onSnapshot, 
  addDoc,
  updateDoc,
  deleteDoc, 
  doc,
  increment,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs
} from "firebase/firestore";

// Helper functions
const toNum = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const fmt = (val) => toNum(val).toFixed(2);

export default function SalesInvoice({ lang = "si" }) {
  const { user } = useUserAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth <= 768);
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Data state
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [syncStatus, setSyncStatus] = useState('connecting');

  // Form state
  const [editingDoc, setEditingDoc] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Load from Local Hard Disk First
  useEffect(() => {
    if (!user?.uid) return;

    const loadLocal = async () => {
      try {
        if (dexieDb.invoices) {
          const localSales = await dexieDb.invoices.toArray();
          const userSales = localSales.filter(s => s.uid === user.uid || s.userId === user.uid);
          if (userSales.length > 0) {
            setSales(userSales.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
          }
        }
      } catch (e) {
        console.warn('Local read err:', e);
      }
    };
    loadLocal();
  }, [user?.uid]);

  // REAL-TIME FIREBASE SYNC (Safe Query without composite index 400 error)
  useEffect(() => {
    if (!user?.uid) return;

    setSyncStatus('connecting');

    // 1. Sales Invoices Listener (Simple query to prevent 400 error)
    const salesQuery = query(
      collection(db, "salesInvoices"), 
      where("uid", "==", user.uid)
    );

    const unsubSales = onSnapshot(salesQuery, async (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setSales(list);
      setSyncStatus('connected');

      // Auto save to PC Hard Disk
      if (list.length > 0 && dexieDb.invoices) {
        try {
          await dexieDb.invoices.bulkPut(list.map(s => ({ ...s, userId: user.uid, uid: user.uid })));
        } catch (err) {}
      }
    }, (error) => {
      console.error("Sales sync error:", error);
      setSyncStatus('error');
    });

    // 2. Items listener
    const itemsQuery = query(collection(db, "items"), where("uid", "==", user.uid));
    const unsubItems = onSnapshot(itemsQuery, async (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(list);
      if (list.length > 0 && dexieDb.items) {
        try { await dexieDb.items.bulkPut(list.map(i => ({ ...i, userId: user.uid, uid: user.uid }))); } catch (e) {}
      }
    }, (err) => console.warn("Items sync:", err));

    // 3. Customers listener
    const customersQuery = query(collection(db, "customers"), where("uid", "==", user.uid));
    const unsubCustomers = onSnapshot(customersQuery, async (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomers(list);
      if (list.length > 0 && dexieDb.customers) {
        try { await dexieDb.customers.bulkPut(list.map(c => ({ ...c, userId: user.uid, uid: user.uid }))); } catch (e) {}
      }
    }, (err) => console.warn("Customers sync:", err));

    return () => {
      unsubSales();
      unsubItems();
      unsubCustomers();
    };
  }, [user?.uid]);

  // Calculations
  const grossAmount = invoiceItems.reduce((sum, item) => sum + (toNum(item.qty) * toNum(item.sellingPrice)), 0);
  const netAmount = Math.max(0, grossAmount - toNum(discount));
  const balance = Math.max(0, netAmount - toNum(paid));

  // Filtered sales
  const filteredSales = sales.filter(s => {
    const cust = typeof s.customer === 'object' ? (s.customer?.name || '') : (s.customer || '');
    const num = s.invoiceNumber || s.id || '';
    const matchSearch = `${num} ${cust}`.toLowerCase().includes(searchTerm.toLowerCase());

    if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      return matchSearch && (s.createdAt || '').startsWith(today);
    }
    return matchSearch;
  });

  const totalSalesVal = filteredSales.reduce((sum, s) => sum + toNum(s.netAmount || s.total || 0), 0);
  const totalPaidVal = filteredSales.reduce((sum, s) => sum + toNum(s.paid || 0), 0);
  const totalDueVal = filteredSales.reduce((sum, s) => sum + toNum(s.balance || 0), 0);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Top Header Card */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '18px 24px',
        marginBottom: '16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        borderLeft: '5px solid #2563eb'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧾</span> {lang === 'si' ? 'විකුණුම් ඉන්වොයිස් ලැයිස්තුව' : 'Sales Invoices'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '13px', color: '#64748b' }}>
            <span>💾 PC Hard Disk (Offline Ready)</span>
            <span>•</span>
            <span style={{ color: syncStatus === 'connected' ? '#059669' : '#d97706', fontWeight: 'bold' }}>
              {syncStatus === 'connected' ? '🟢 Cloud Live Synced' : '🟡 Connecting to Cloud...'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: '#475569', backgroundColor: '#f8fafc', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          User: <strong>{user?.email || user?.displayName || user?.uid?.substring(0, 10)}</strong>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', borderTop: '4px solid #2563eb' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{lang === 'si' ? 'මුළු ඉන්වොයිස් ගණන' : 'TOTAL INVOICES'}</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{filteredSales.length}</div>
        </div>

        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', borderTop: '4px solid #059669' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{lang === 'si' ? 'මුළු විකුණුම්' : 'TOTAL SALES'}</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#059669', marginTop: '4px' }}>
            Rs. {totalSalesVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', borderTop: '4px solid #d97706' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{lang === 'si' ? 'ලැබුණු මුදල්' : 'PAID'}</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>
            Rs. {totalPaidVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', borderTop: '4px solid #dc2626' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{lang === 'si' ? 'හිඟ මුදල්' : 'DUE BALANCE'}</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#dc2626', marginTop: '4px' }}>
            Rs. {totalDueVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '10px', marginBottom: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={lang === 'si' ? "🔍 ඉන්වොයිස් අංකය හෝ පාරිභෝගික නම සොයන්න..." : "🔍 Search invoice # or customer..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: '1 1 260px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        />
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#fff', fontWeight: '600' }}
        >
          <option value="all">{lang === 'si' ? '📅 සියලුම දින' : 'All Time'}</option>
          <option value="today">{lang === 'si' ? '📅 අද දින' : 'Today'}</option>
        </select>
      </div>

      {/* Sales Invoices Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {filteredSales.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📭</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              {syncStatus === 'connecting' ? 'Cloud දත්ත පූරණය වෙමින් පවතී...' : 'ඉන්වොයිස් කිසිවක් හමු නොවීය'}
            </div>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>
              {syncStatus === 'connecting' ? 'කරුණාකර තත්පර කිහිපයක් රැඳී සිටින්න.' : 'නව විකුණුමක් ඇතුළත් කිරීමට POS හෝ New Sale භාවිතා කරන්න.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px' }}>Invoice #</th>
                  <th style={{ padding: '12px 16px' }}>දිනය / වේලාව</th>
                  <th style={{ padding: '12px 16px' }}>පාරිභෝගිකයා</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>මුළු එකතුව</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>ගෙවූ මුදල</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>හිඟ මුදල</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>තත්ත්වය</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale, idx) => {
                  const saleAmount = toNum(sale.netAmount || sale.total || 0);
                  const salePaid = toNum(sale.paid || 0);
                  const saleBal = toNum(sale.balance || (saleAmount - salePaid > 0 ? saleAmount - salePaid : 0));
                  const custName = typeof sale.customer === 'object' ? (sale.customer?.name || 'Walk-in') : (sale.customer || 'Walk-in');
                  const dateStr = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : (sale.date ? new Date(sale.date).toLocaleDateString() : '-');

                  return (
                    <tr
                      key={sale.id || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fbfcfd'
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: '700', color: '#2563eb' }}>
                        {sale.invoiceNumber || sale.id?.substring(0, 8) || 'INV'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{dateStr}</td>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1e293b' }}>{custName}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '800', color: '#0f172a' }}>
                        Rs. {saleAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#059669' }}>
                        Rs. {salePaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: saleBal > 0 ? '#dc2626' : '#64748b' }}>
                        Rs. {saleBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          backgroundColor: saleBal > 0 ? '#fef3c7' : '#dcfce7',
                          color: saleBal > 0 ? '#b45309' : '#15803d'
                        }}>
                          {saleBal > 0 ? 'CREDIT' : 'PAID'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

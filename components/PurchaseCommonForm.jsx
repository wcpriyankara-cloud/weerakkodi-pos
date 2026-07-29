'use client';

// components/PurchaseCommonForm.jsx

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react';

import { db, storage } from '@/firebaseConfig';
import {
  ref as storageRef, uploadBytes, getDownloadURL
} from 'firebase/storage';
import {
  collection, addDoc, getDocs, serverTimestamp,
  query, where, doc, updateDoc, increment, deleteDoc,
  onSnapshot, Timestamp
} from 'firebase/firestore';
import { useUserAuth } from '@/context/UserContext';
import { Html5Qrcode } from 'html5-qrcode';
// ═══════════════════════════════════════════════════════════
// CONSTANTS — component outside (stable references)
// ═══════════════════════════════════════════════════════════
const INIT_LINE_ITEM = Object.freeze({
  itemId: '', name: '', qty: 1,
  buyingPrice: 0, discountPercent: 0, buyingNetPrice: 0,
  retailPrice: 0, retailDiscount: 0, retailYourPrice: 0,
  wholesalePrice: 0, wholesaleDiscount: 0, wholesaleYourPrice: 0,
  loosePrice: 0, looseDiscount: 0, looseYourPrice: 0,
  barcode: '', warranty: '',
  expiryDate: '',
  batchNo: '',
});

const PRICE_FIELDS = Object.freeze({
  buying:    { p: 'buyingPrice',    d: 'discountPercent',   y: 'buyingNetPrice'     },
  retail:    { p: 'retailPrice',    d: 'retailDiscount',    y: 'retailYourPrice'    },
  wholesale: { p: 'wholesalePrice', d: 'wholesaleDiscount', y: 'wholesaleYourPrice' },
  loose:     { p: 'loosePrice',     d: 'looseDiscount',     y: 'looseYourPrice'     },
});

const PAYMENT_METHODS = [
  { v: 'cash',   l: '💵 Cash',   c: '#16a34a' },
  { v: 'bank',   l: '🏦 Bank',   c: '#2563eb' },
  { v: 'cheque', l: '📝 Cheque', c: '#7c3aed' },
  { v: 'online', l: '📱 Online', c: '#0891b2' },
];

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════
const toNum = (val) => {
  if (typeof val === 'number') return Math.round(val * 100) / 100;
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

const calcNetPrice = (p, d) =>
  Math.round((toNum(p) - (toNum(p) * toNum(d) / 100)) * 100) / 100;

const formatCurrency = (v) =>
  toNum(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatBankBalance = (amount, currency = 'LKR') =>
  (parseFloat(amount) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ' + currency;

const formatDate = (val) => {
  if (!val) return 'N/A';
  if (val?.toDate) {
    const d = val.toDate();
    return (
      d.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      }) +
      ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  }
  if (typeof val === 'string') {
    try {
      return new Date(val).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return val; }
  }
  return String(val);
};

const getBuyingPrice = (item) =>
  item
    ? toNum(
        item.buyingPrice ||
        item.costPrice ||
        item.purchasePrice ||
        item.price ||
        0
      )
    : 0;

const getBuyingDiscount = (item) =>
  item
    ? toNum(
        item.buyingDiscount ||
        item.costDiscount ||
        item.discountPercent ||
        0
      )
    : 0;

const localISODate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const nowHHMM = () => new Date().toTimeString().slice(0, 5);

const getSupplierBalance = (supplier) => {
  if (!supplier) return 0;
  const b = parseFloat(supplier.balance);
  if (!isNaN(b) && b !== 0) return b;
  const c = parseFloat(supplier.currentBalance);
  if (!isNaN(c)) return c;
  return parseFloat(supplier.openingBalance) || 0;
};

// ─── Expiry helpers ───
const getExpiryStatus = (expiryDate, todayRef = null) => {
  if (!expiryDate) return null;
  const today = todayRef ? new Date(todayRef) : new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)
    return {
      status: 'expired',
      label: `කල් ඉකුත්ව ${Math.abs(diffDays)} දින`,
      color: '#dc2626', bg: '#fef2f2',
      border: '#fca5a5', icon: '🔴',
    };
  if (diffDays === 0)
    return {
      status: 'today',
      label: 'අද කල් ඉකුත් වේ!',
      color: '#dc2626', bg: '#fef2f2',
      border: '#fca5a5', icon: '⚠️',
    };
  if (diffDays <= 30)
    return {
      status: 'soon',
      label: `${diffDays} දිනකින් කල් ඉකුත්`,
      color: '#ea580c', bg: '#fff7ed',
      border: '#fdba74', icon: '🟠',
    };
  if (diffDays <= 90)
    return {
      status: 'warning',
      label: `${diffDays} දිනකින් කල් ඉකුත්`,
      color: '#d97706', bg: '#fffbeb',
      border: '#fcd34d', icon: '🟡',
    };
  return {
    status: 'ok',
    label: `${diffDays} දින ඉතිරිය`,
    color: '#16a34a', bg: '#f0fdf4',
    border: '#86efac', icon: '🟢',
  };
};

const formatExpiryDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
};

// ─── Image compression — single reusable function ───
const compressImage = (file, maxWidth = 600, quality = 0.5) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) =>
            resolve(
              blob
                ? new File([blob], file.name || 'image.jpg', {
                    type: 'image/jpeg',
                  })
                : file
            ),
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });

// Specific presets using shared function
const compressSupplierPhoto = (file) => compressImage(file, 400, 0.6);
const compressReceiptImage  = (file) => compressImage(file, 600, 0.5);

const uploadOneImage = async (file, path) => {
  if (!storage) return { url: null };
  try {
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return { url: await getDownloadURL(ref) };
  } catch (e) {
    console.warn('Storage upload:', e.code);
    return { url: null };
  }
};

// ═══════════════════════════════════════════════════════════
// SUPPLIER BALANCE UPDATE
// ═══════════════════════════════════════════════════════════
const updateSupplierBalanceFields = async (
  supplierId,
  amount,
  mode = 'add'
) => {
  if (!supplierId) {
    console.warn('updateSupplierBalanceFields: Missing supplierId');
    return;
  }
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (amt <= 0) {
    console.warn('updateSupplierBalanceFields: Invalid amount', amount);
    return;
  }
  try {
    const change = mode === 'add' ? amt : -amt;
    await updateDoc(doc(db, 'suppliers', supplierId), {
      balance: increment(change),
      currentBalance: increment(change),
      updatedAt: serverTimestamp(), // ✅ server timestamp
    });
  } catch (err) {
    console.error('updateSupplierBalanceFields:', err);
  }
};

// ═══════════════════════════════════════════════════════════
// CASH TRANSACTION SAVE
// ═══════════════════════════════════════════════════════════
const savePurchaseCashTransaction = async ({
  user, amount, supplierId, supplierName,
  invoiceId, invoiceNo, paymentMethod = 'cash',
  bankAccountId = null, bankAccountName = '',
  bankName = '', notes = '', items = [],
  date, time,
}) => {
  const roundedAmt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (!user?.uid || roundedAmt <= 0) return null;

  const sanitizedItems = Array.isArray(items)
    ? items
        .filter(Boolean)
        .map((i) => ({
          itemId: String(i.itemId || ''),
          name: String(i.name || i.itemName || ''),
          qty: toNum(i.qty ?? i.quantity ?? 0),
          buyingPrice: toNum(i.buyingPrice ?? i.price ?? 0),
          totalCost: toNum(i.totalCost ?? i.total ?? i.lineTotal ?? 0),
        }))
    : [];

  try {
    const docRef = await addDoc(
      collection(db, `users/${user.uid}/cashTransactions`),
      {
        type: 'out',
        category: 'supplierPayment',
        source: 'purchase',
        amount: roundedAmt,
        supplierId: supplierId || '',
        supplier_id: supplierId || '',
        supplierName: supplierName || '',
        invoiceId: invoiceId || '',
        invoiceNo: invoiceNo || '',
        paymentMethod: paymentMethod || 'cash',
        bankAccountId:
          paymentMethod === 'bank' ? bankAccountId || null : null,
        bankAccountName:
          paymentMethod === 'bank' ? bankAccountName || '' : '',
        bankName: paymentMethod === 'bank' ? bankName || '' : '',
        description: `📦 ${supplierName || 'Supplier'} — Rs.${roundedAmt.toFixed(2)}`,
        notes: notes || '',
        items: sanitizedItems,
        date: date || localISODate(),
        time: time || nowHHMM(),
        timestamp: Timestamp.now(),
        createdAt: serverTimestamp(),
        createdBy: user?.email || '',
        isAutomatic: true,
        uid: user.uid,
      }
    );
    return docRef.id;
  } catch (err) {
    console.error('cashTransaction FAILED:', err);
    return null;
  }
};

// ═══════════════════════════════════════════════════════════
// TAB WARNING MODAL
// ═══════════════════════════════════════════════════════════
const TabWarningModal = ({ isOpen, cartCount, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: 16,
          padding: 28, maxWidth: 380, width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h3 style={{ margin: '0 0 10px', color: '#1e293b' }}>
          Cart Items ඇත
        </h3>
        <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 20px' }}>
          Cart එකේ <b>{cartCount}</b> item(s) ඇත. Tab change කළොත් cart clear වේ.
          Continue කරන්නද?
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              border: '2px solid #e2e8f0',
              background: 'white', color: '#64748b',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            ❌ Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: 'white', fontWeight: 700,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            ✅ Continue
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// CONTACTS PICKER MODAL
// ═══════════════════════════════════════════════════════════
const ContactsPickerModal = ({ isOpen, onClose, onSelectContact }) => {
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const fileRef                   = useRef(null);

  const isContactsAPISupported = () =>
    'contacts' in navigator && 'ContactsManager' in window;

  // Reset on close
  useEffect(() => {
    if (!isOpen) { setContacts([]); setSearch(''); setError(''); }
  }, [isOpen]);

  // Revoke blob URLs on contacts change
  useEffect(() => {
    return () => {
      contacts.forEach((c) => {
        if (c.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(c.photoUrl);
      });
    };
  }, [contacts]);

  const loadContactsViaAPI = async () => {
    setLoading(true); setError('');
    try {
      const props = ['name', 'tel', 'email', 'address', 'icon'];
      const supported = await navigator.contacts.getProperties();
      const reqProps = props.filter((p) => supported.includes(p));
      const selected = await navigator.contacts.select(reqProps, {
        multiple: true,
      });
      if (!selected?.length) { setLoading(false); return; }

      const parsed = await Promise.all(
        selected.map(async (contact, idx) => {
          let photoUrl = null, photoBlob = null;
          if (contact.icon?.length > 0) {
            try {
              const blob = contact.icon[0];
              photoUrl = URL.createObjectURL(blob);
              photoBlob = blob;
            } catch (e) { console.warn('Photo error:', e); }
          }
          return {
            id: `contact_${idx}_${Date.now()}`,
            name: contact.name?.[0] || '',
            phone: contact.tel?.[0] || '',
            phones: contact.tel || [],
            email: contact.email?.[0] || '',
            emails: contact.email || [],
            address:
              contact.address?.[0]?.street ||
              contact.address?.[0]?.formattedAddress ||
              '',
            photoUrl, photoBlob, raw: contact,
          };
        })
      );
      setContacts(parsed);
    } catch (e) {
      if (e.name === 'TypeError') {
        setError('📱 Contacts API support නැත. vCard import කරන්න.');
      } else if (e.name !== 'InvalidStateError') {
        setError(`❌ Error: ${e.message}`);
      }
    } finally { setLoading(false); }
  };

  const handleVCardImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const vcards = text.split('BEGIN:VCARD').filter(Boolean);
      const parsed = vcards
        .map((vcard, idx) => {
          const fn  = vcard.match(/FN[;:](.+)/i);
          const n   = vcard.match(/N[;:]([^;]+);([^;]+)/i);
          const name = fn
            ? fn[1].trim()
            : n ? `${n[2]} ${n[1]}`.trim() : '';
          const tel = vcard.match(/TEL[;:][^:]*:(.+)/i);
          const em  = vcard.match(/EMAIL[;:][^:]*:(.+)/i);
          const adr = vcard.match(/ADR[;:][^:]*:(.+)/i);
          return {
            id: `vcard_${idx}_${Date.now()}`,
            name,
            phone: tel ? tel[1].trim() : '',
            phones: tel ? [tel[1].trim()] : [],
            email: em ? em[1].trim() : '',
            emails: em ? [em[1].trim()] : [],
            address: adr ? adr[1].replace(/;/g, ', ').trim() : '',
            photoUrl: null, photoBlob: null,
          };
        })
        .filter((c) => c.name || c.phone);
      setContacts(parsed);
    } catch (err) {
      setError('❌ vCard read error: ' + err.message);
    }
    e.target.value = '';
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s) ||
        (c.email || '').toLowerCase().includes(s)
    );
  }, [contacts, search]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 10001,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 520,
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>
              📱 Contacts
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              Phone contact list එකෙන් import කරන්න
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: 'none',
              borderRadius: '50%', width: 36, height: 36,
              fontSize: 16, cursor: 'pointer', color: '#64748b',
            }}
          >
            ✕
          </button>
        </div>

        {contacts.length === 0 && (
          <div style={{ padding: 20 }}>
            {isContactsAPISupported() && (
              <button
                onClick={loadContactsViaAPI}
                disabled={loading}
                style={{
                  width: '100%', padding: 16, borderRadius: 12,
                  border: 'none',
                  background: loading
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #3b82f6, #1e40af)',
                  color: 'white', fontSize: 16, fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer',
                  marginBottom: 10,
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 10,
                }}
              >
                {loading ? '⏳ Loading...' : '📱 Phone Contacts Open කරන්න'}
              </button>
            )}
            <input
              ref={fileRef} type="file" accept=".vcf,.vcard"
              onChange={handleVCardImport}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: 14, borderRadius: 12,
                border: '2px dashed #cbd5e1', background: '#f8fafc',
                color: '#475569', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}
            >
              📂 vCard File Import (.vcf)
            </button>
            {!isContactsAPISupported() && (
              <div
                style={{
                  marginTop: 12, padding: 12, background: '#fef3c7',
                  borderRadius: 10, border: '1px solid #fcd34d',
                  fontSize: 13, color: '#92400e', textAlign: 'center',
                }}
              >
                ⚠️ Chrome Android 80+ හෝ vCard import භාවිතා කරන්න
              </div>
            )}
            {error && (
              <div
                style={{
                  marginTop: 10, padding: 12, background: '#fef2f2',
                  borderRadius: 10, border: '1px solid #fca5a5',
                  fontSize: 13, color: '#991b1b', textAlign: 'center',
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {contacts.length > 0 && (
          <>
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <input
                placeholder="🔍 Contact සොයන්න..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: 12, borderRadius: 10,
                  border: '1px solid #e2e8f0', outline: 'none',
                  fontSize: 14, boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                {filtered.length} contacts found
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {filtered.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => { onSelectContact(contact); onClose(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 12, marginBottom: 6, borderRadius: 12,
                    cursor: 'pointer', border: '1px solid #e2e8f0',
                    background: 'white', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#f8fafc')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'white')
                  }
                >
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: '50%',
                      overflow: 'hidden', flexShrink: 0,
                      border: '2px solid #e2e8f0', background: '#f1f5f9',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {contact.photoUrl ? (
                      <img
                        src={contact.photoUrl} alt={contact.name}
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%', height: '100%',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center',
                          background: `hsl(${
                            (contact.name || '').charCodeAt(0) * 37 % 360
                          }, 55%, 80%)`,
                          color: `hsl(${
                            (contact.name || '').charCodeAt(0) * 37 % 360
                          }, 55%, 30%)`,
                          fontWeight: 800, fontSize: 20,
                        }}
                      >
                        {(contact.name || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700, fontSize: 15, color: '#1e293b',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {contact.name || 'Unknown'}
                    </div>
                    {contact.phone && (
                      <div style={{ fontSize: 13, color: '#3b82f6', marginTop: 2 }}>
                        📞 {contact.phone}
                      </div>
                    )}
                    {contact.email && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                        ✉️ {contact.email}
                      </div>
                    )}
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 18 }}>›</span>
                </div>
              ))}
              {filtered.length === 0 && (
                <div
                  style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}
                >
                  🔍 "{search}" හමු නොවීය
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// NEW SUPPLIER MODAL
// ═══════════════════════════════════════════════════════════
const NewSupplierModal = ({
  isOpen, onClose, onSaved, initialData = {}, user,
}) => {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '',
    company: '', notes: '', photoFile: null, photoPreview: null,
  });
  const [saving, setSaving]           = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const photoRef = useRef(null);
  const camRef   = useRef(null);

  // Cleanup blob URL on photoPreview change
  useEffect(() => {
    return () => {
      if (form.photoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(form.photoPreview);
      }
    };
  }, [form.photoPreview]);

  // Use ref to avoid JSON.stringify in deps
  const initialDataRef = useRef(initialData);
  useEffect(() => {
    if (!isOpen) return;
    const d = initialDataRef.current;
    setForm({
      name: d.name || '',
      phone: d.phone || '',
      email: d.email || '',
      address: d.address || '',
      company: d.company || '',
      notes: '',
      photoFile: d.photoFile || null,
      photoPreview: d.photoPreview || d.photoUrl || null,
    });
  }, [isOpen]);

  // Sync initialData changes via ref
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  const handleContactSelected = async (contact) => {
    let photoFile = null;
    let photoPreview = contact.photoUrl || null;
    if (contact.photoBlob) {
      try {
        const f = new File(
          [contact.photoBlob],
          `contact_${Date.now()}.jpg`,
          { type: contact.photoBlob.type || 'image/jpeg' }
        );
        photoFile = await compressSupplierPhoto(f);
        photoPreview = URL.createObjectURL(photoFile);
      } catch (e) { console.warn('Photo error:', e); }
    } else if (contact.photoUrl?.startsWith('blob:')) {
      try {
        const res  = await fetch(contact.photoUrl);
        const blob = await res.blob();
        const f    = new File(
          [blob], `contact_${Date.now()}.jpg`,
          { type: blob.type || 'image/jpeg' }
        );
        photoFile    = await compressSupplierPhoto(f);
        photoPreview = URL.createObjectURL(photoFile);
      } catch (e) { console.warn('Blob error:', e); }
    }
    setForm((prev) => ({
      ...prev,
      name:         contact.name    || prev.name,
      phone:        contact.phone   || prev.phone,
      email:        contact.email   || prev.email,
      address:      contact.address || prev.address,
      photoFile:    photoFile    || prev.photoFile,
      photoPreview: photoPreview || prev.photoPreview,
    }));
    setShowContacts(false);
  };

  const handlePhotoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const compressed = await compressSupplierPhoto(file);
      setForm((p) => ({
        ...p,
        photoFile: compressed,
        photoPreview: URL.createObjectURL(compressed),
      }));
    } catch {
      setForm((p) => ({
        ...p,
        photoFile: file,
        photoPreview: URL.createObjectURL(file),
      }));
    }
    e.target.value = '';
  };

  const removePhoto = () => {
    setForm((p) => ({ ...p, photoFile: null, photoPreview: null }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('❌ නම ඇතුළත් කරන්න');
    if (saving) return;
    setSaving(true);
    try {
      let imageUrl = '';
      if (form.photoFile && storage) {
        try {
          const path = `suppliers/${user.uid}/${Date.now()}_${
            form.photoFile.name || 'photo.jpg'
          }`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, form.photoFile);
          imageUrl = await getDownloadURL(ref);
        } catch (e) { console.warn('Photo upload error:', e); }
      }
      const docRef = await addDoc(collection(db, 'suppliers'), {
        name:     form.name.trim(),
        phone:    form.phone.trim(),
        email:    form.email.trim(),
        address:  form.address.trim(),
        company:  form.company.trim(),
        notes:    form.notes.trim(),
        imageUrl, photoUrl: imageUrl,
        balance: 0, currentBalance: 0, openingBalance: 0,
        uid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'purchase_form',
      });
      const newSupplier = {
        id:       docRef.id,
        name:     form.name.trim(),
        phone:    form.phone.trim(),
        email:    form.email.trim(),
        address:  form.address.trim(),
        company:  form.company.trim(),
        imageUrl, photoUrl: imageUrl,
        balance: 0, currentBalance: 0, openingBalance: 0,
        uid: user.uid,
      };
      onSaved(newSupplier);
      onClose();
    } catch (e) {
      alert('❌ Save error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const inp = {
    width: '100%', padding: 12, borderRadius: 10,
    border: '1px solid #cbd5e1', outline: 'none',
    fontSize: 14, boxSizing: 'border-box',
  };
  const lbl = {
    display: 'block', marginBottom: 6,
    fontSize: 12, fontWeight: 700, color: '#475569',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: 16, width: '100%',
          maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #059669, #10b981)',
            padding: 20, borderRadius: '16px 16px 0 0',
            color: 'white',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>🏪 නව සැපයුම්කරු</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>
              නව සැපයුම්කරු register කරන්න
            </p>
          </div>
          <button
            onClick={onClose} disabled={saving}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: 'white', borderRadius: '50%',
              width: 36, height: 36, fontSize: 16, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Contacts autofill */}
          <button
            onClick={() => setShowContacts(true)} disabled={saving}
            style={{
              width: '100%', padding: 14, borderRadius: 12,
              border: '2px dashed #3b82f6', background: '#eff6ff',
              color: '#1e40af', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', marginBottom: 20,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10,
            }}
          >
            📱 Contacts වලින් Auto-fill කරන්න
          </button>

          {/* Photo picker */}
          <div
            style={{
              display: 'flex', justifyContent: 'center', marginBottom: 20,
            }}
          >
            <div style={{ position: 'relative' }}>
              <input
                ref={photoRef} type="file" accept="image/*"
                onChange={handlePhotoPick}
                style={{ display: 'none' }}
              />
              <input
                ref={camRef} type="file" accept="image/*"
                capture="environment" onChange={handlePhotoPick}
                style={{ display: 'none' }}
              />
              <div
                style={{
                  width: 90, height: 90, borderRadius: '50%',
                  overflow: 'hidden', border: '3px solid #e2e8f0',
                  background: '#f1f5f9',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer',
                }}
                onClick={() => photoRef.current?.click()}
              >
                {form.photoPreview ? (
                  <img
                    src={form.photoPreview} alt="Supplier"
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28 }}>📸</div>
                    <div
                      style={{
                        fontSize: 9, color: '#94a3b8', marginTop: 2,
                      }}
                    >
                      Photo
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  camRef.current?.click();
                }}
                style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#3b82f6', border: '2px solid white',
                  color: 'white', fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                📷
              </button>
              {form.photoPreview && (
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(); }}
                  style={{
                    position: 'absolute', top: -4, left: -4,
                    width: 24, height: 24, borderRadius: '50%',
                    background: '#ef4444', border: '2px solid white',
                    color: 'white', fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={lbl}>👤 නම *</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="සැපයුම්කරුගේ නම"
                style={{
                  ...inp,
                  border: '2px solid #10b981',
                  fontSize: 16, fontWeight: 600,
                }}
                autoFocus
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: 12,
              }}
            >
              <div>
                <label style={lbl}>📞 දුරකථන</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="07X XXXX XXX"
                  type="tel" style={inp}
                />
              </div>
              <div>
                <label style={lbl}>✉️ Email</label>
                <input
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="email@example.com"
                  type="email" style={inp}
                />
              </div>
            </div>
            <div>
              <label style={lbl}>🏢 සමාගම</label>
              <input
                value={form.company}
                onChange={(e) =>
                  setForm((p) => ({ ...p, company: e.target.value }))
                }
                placeholder="සමාගම් නම" style={inp}
              />
            </div>
            <div>
              <label style={lbl}>📍 ලිපිනය</label>
              <textarea
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({ ...p, address: e.target.value }))
                }
                placeholder="ලිපිනය" rows={2}
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={lbl}>📝 සටහන්</label>
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="අමතර සටහන්" style={inp}
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            style={{
              width: '100%', padding: 16, borderRadius: 12,
              border: 'none', fontSize: 16, fontWeight: 700,
              color: 'white', cursor: 'pointer', marginTop: 20,
              background:
                saving || !form.name.trim()
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #059669, #10b981)',
            }}
          >
            {saving
              ? '⏳ Saving...'
              : `✅ "${form.name || 'Supplier'}" Save කරන්න`}
          </button>
        </div>
      </div>
      <ContactsPickerModal
        isOpen={showContacts}
        onClose={() => setShowContacts(false)}
        onSelectContact={handleContactSelected}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// SUPPLIER SEARCHABLE SELECT
// ═══════════════════════════════════════════════════════════
const SupplierSearchableSelect = ({
  options, value, onChange, onSupplierCreated,
  placeholder = 'සැපයුම්කරු තෝරන්න', user,
}) => {
  const [isOpen, setIsOpen]               = useState(false);
  const [search, setSearch]               = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContactsPicker, setShowContactsPicker] = useState(false);
  const [createInitialData, setCreateInitialData]   = useState({});
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = useMemo(
    () => (options || []).find((o) => o.id === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return options || [];
    const s = search.toLowerCase().trim();
    return (options || []).filter((o) =>
      [o?.name, o?.company, o?.phone, o?.email, o?.sinhalaName].some(
        (f) => f && String(f).toLowerCase().includes(s)
      )
    );
  }, [options, search]);

  const noMatch = search.trim().length > 0 && filtered.length === 0;
  const getImg  = (s) => s?.imageUrl || s?.photoUrl || s?.image || null;

  const handleSupplierCreated = (newSupplier) => {
    onSupplierCreated?.(newSupplier);
    onChange(newSupplier.id);
    setIsOpen(false); setSearch('');
    setShowCreateModal(false); setCreateInitialData({});
  };

  const handleContactForCreate = (contact) => {
    setShowContactsPicker(false);
    setCreateInitialData({
      name: contact.name || '', phone: contact.phone || '',
      email: contact.email || '', address: contact.address || '',
      photoUrl: contact.photoUrl || null,
      photoPreview: contact.photoUrl || null,
      photoBlob: contact.photoBlob || null,
    });
    setTimeout(() => setShowCreateModal(true), 250);
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '12px 14px',
          border: selected ? '2px solid #10b981' : '1px solid #cbd5e1',
          borderRadius: 12,
          background: selected ? '#f0fdf4' : 'white',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center',
          gap: 12, minHeight: 54, transition: 'all 0.2s',
        }}
      >
        {selected && (
          <div
            style={{
              width: 38, height: 38, borderRadius: '50%',
              overflow: 'hidden', flexShrink: 0,
              border: '2px solid #d1fae5', background: '#ecfdf5',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getImg(selected) ? (
              <img
                src={getImg(selected)} alt={selected.name}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <span
                style={{ fontSize: 17, fontWeight: 800, color: '#059669' }}
              >
                {(selected.name || '?')[0]?.toUpperCase()}
              </span>
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              color: selected ? '#1e293b' : '#94a3b8',
              fontWeight: selected ? 600 : 400, fontSize: 15,
            }}
          >
            {selected ? selected.name : placeholder}
          </span>
          {selected?.phone && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              📞 {selected.phone}
            </div>
          )}
          {selected?.company && (
            <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 1 }}>
              🏢 {selected.company}
            </div>
          )}
        </div>
        <span style={{ color: '#94a3b8', fontSize: 12, flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute', top: '100%', width: '100%',
            background: 'white', border: '1px solid #cbd5e1',
            borderRadius: 12, marginTop: 6, zIndex: 1000,
            maxHeight: 500, overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          }}
        >
          {/* Search */}
          <div
            style={{
              position: 'sticky', top: 0, background: 'white',
              zIndex: 1, borderBottom: '2px solid #e2e8f0',
            }}
          >
            <input
              autoFocus
              placeholder="🔍 නම, දුරකථනය, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: 14, border: 'none',
                outline: 'none', boxSizing: 'border-box', fontSize: 15,
              }}
            />
          </div>

          {/* Actions */}
          <div
            style={{
              padding: '8px 10px',
              display: 'flex', gap: 8,
              borderBottom: '1px solid #f1f5f9',
              background: '#f8fafc',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCreateInitialData({ name: search.trim() });
                setShowCreateModal(true); setIsOpen(false);
              }}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 10,
                border: '2px dashed #10b981', background: '#f0fdf4',
                color: '#059669', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 6,
              }}
            >
              ➕ නව සැපයුම්කරු
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowContactsPicker(true); setIsOpen(false);
              }}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 10,
                border: '2px dashed #3b82f6', background: '#eff6ff',
                color: '#1e40af', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 6,
              }}
            >
              📱 Contacts
            </button>
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {filtered.map((o) => {
              const img   = getImg(o);
              const isSel = value === o.id;
              const bal   = parseFloat(o.balance || o.currentBalance || 0);
              return (
                <div
                  key={o.id}
                  onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}
                  style={{
                    padding: '12px 14px', cursor: 'pointer',
                    background: isSel ? '#f0fdf4' : 'white',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      overflow: 'hidden', flexShrink: 0,
                      border: isSel
                        ? '2px solid #10b981'
                        : '2px solid #e2e8f0',
                      background: '#f1f5f9',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {img ? (
                      <img
                        src={img} alt={o.name}
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'cover',
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: 18, fontWeight: 800,
                          color: '#94a3b8',
                        }}
                      >
                        {(o.name || '?')[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600, fontSize: 15, color: '#1e293b',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {isSel && (
                        <span style={{ color: '#10b981' }}>✓</span>
                      )}
                      {o.name}
                    </div>
                    <div
                      style={{
                        display: 'flex', gap: 6,
                        flexWrap: 'wrap', marginTop: 3,
                      }}
                    >
                      {o.phone && (
                        <span
                          style={{
                            fontSize: 11, color: '#3b82f6',
                            background: '#eff6ff',
                            padding: '1px 6px', borderRadius: 4,
                          }}
                        >
                          📞 {o.phone}
                        </span>
                      )}
                      {o.company && (
                        <span
                          style={{
                            fontSize: 11, color: '#7c3aed',
                            background: '#f5f3ff',
                            padding: '1px 6px', borderRadius: 4,
                          }}
                        >
                          🏢 {o.company}
                        </span>
                      )}
                    </div>
                  </div>
                  {bal !== 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        ශේෂය
                      </div>
                      <div
                        style={{
                          fontSize: 13, fontWeight: 800,
                          color: bal > 0 ? '#dc2626' : '#16a34a',
                        }}
                      >
                        {Math.abs(bal).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {noMatch && (
              <div style={{ padding: 28, textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>🔍</div>
                <div
                  style={{
                    fontSize: 16, fontWeight: 700,
                    color: '#1e293b', marginBottom: 6,
                  }}
                >
                  "{search}" හමු නොවීය
                </div>
                <p
                  style={{
                    fontSize: 13, color: '#64748b', marginBottom: 16,
                  }}
                >
                  නව සැපයුම්කරුවකු ලෙස එකතු කරන්න
                </p>
                <div
                  style={{
                    display: 'flex', gap: 8,
                    justifyContent: 'center',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreateInitialData({ name: search.trim() });
                      setShowCreateModal(true); setIsOpen(false);
                    }}
                    style={{
                      padding: '11px 20px', borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #059669, #10b981)',
                      color: 'white', fontWeight: 700,
                      fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    ➕ "{search}" Add
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowContactsPicker(true); setIsOpen(false);
                    }}
                    style={{
                      padding: '11px 20px', borderRadius: 10,
                      border: '2px solid #3b82f6',
                      background: '#eff6ff', color: '#1e40af',
                      fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    📱 Contacts
                  </button>
                </div>
              </div>
            )}

            {!search.trim() && filtered.length === 0 && (
              <div
                style={{
                  padding: 30, textAlign: 'center', color: '#64748b',
                }}
              >
                <div style={{ fontSize: 44, marginBottom: 10 }}>🏪</div>
                <div
                  style={{
                    fontSize: 15, fontWeight: 700, marginBottom: 14,
                  }}
                >
                  සැපයුම්කරුවන් නැත
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreateInitialData({});
                    setShowCreateModal(true); setIsOpen(false);
                  }}
                  style={{
                    padding: '12px 28px', borderRadius: 10, border: 'none',
                    background: '#10b981', color: 'white',
                    fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ➕ පළමු සැපයුම්කරු
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <NewSupplierModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateInitialData({});
        }}
        onSaved={handleSupplierCreated}
        initialData={createInitialData}
        user={user}
      />
      <ContactsPickerModal
        isOpen={showContactsPicker}
        onClose={() => setShowContactsPicker(false)}
        onSelectContact={handleContactForCreate}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// BANK ACCOUNT SELECTOR
// ═══════════════════════════════════════════════════════════
function BankAccountSelector({
  value, onChange, bankAccounts, loading,
  disabled = false,
  label = '🏦 බැංකු ගිණුම *',
  showDeductInfo = false,
  deductAmount = 0,
}) {
  const selected = useMemo(
    () => bankAccounts.find((b) => b.id === value),
    [bankAccounts, value]
  );

  if (loading)
    return (
      <div
        style={{
          padding: 16, background: '#f8fafc', borderRadius: 12,
          border: '2px dashed #cbd5e1',
          textAlign: 'center', color: '#64748b',
        }}
      >
        ⏳
      </div>
    );

  if (!bankAccounts.length)
    return (
      <div
        style={{
          padding: 16, background: '#fef3c7', borderRadius: 12,
          border: '2px solid #fcd34d',
          textAlign: 'center', color: '#92400e',
        }}
      >
        🏦 බැංකු ගිණුම් නැත
      </div>
    );

  return (
    <div>
      {label && (
        <label
          style={{
            display: 'block', marginBottom: 8,
            fontSize: 13, fontWeight: 700, color: '#1e40af',
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 8,
        }}
      >
        {bankAccounts.map((acc) => {
          const isSel = value === acc.id;
          const bal   = parseFloat(acc.currentBalance || 0);
          return (
            <div
              key={acc.id}
              onClick={() => { if (!disabled) onChange(isSel ? '' : acc.id); }}
              style={{
                padding: '12px 16px', borderRadius: 12,
                border: isSel
                  ? '2px solid #3b82f6'
                  : '2px solid #e2e8f0',
                background: isSel
                  ? 'linear-gradient(135deg,#eff6ff,#dbeafe)'
                  : 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: 8, marginBottom: 4,
                  }}
                >
                  {isSel && (
                    <span
                      style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: '#3b82f6', color: 'white',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    🏦 {acc.bankName}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {acc.accountName}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>ශේෂය</div>
                <div
                  style={{
                    fontSize: 16, fontWeight: 800,
                    color: bal >= 0 ? '#16a34a' : '#dc2626',
                  }}
                >
                  {formatBankBalance(bal, acc.currency)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {selected && showDeductInfo && toNum(deductAmount) > 0 && (
        <div
          style={{
            marginTop: 10, padding: '10px 14px',
            background: '#fef2f2', borderRadius: 10,
            border: '1px solid #fca5a5',
            fontSize: 13, color: '#991b1b',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span>⚠️</span>
          <span>
            <b>{selected.bankName}</b> ගිණුමෙන්{' '}
            <b style={{ color: '#dc2626' }}>
              -{formatCurrency(deductAmount)}
            </b>
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCANNER MODAL
// ═══════════════════════════════════════════════════════════
const ScannerModal = ({ isOpen, onClose, onScan }) => {
  const qrRef     = useRef(null);
  // Stable refs for callbacks — avoid stale closures
  const onScanRef  = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onScanRef.current  = onScan;  }, [onScan]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let t;
    t = setTimeout(async () => {
      const el = document.getElementById('qr-reader');
      if (!el) return;
      try {
        qrRef.current = new Html5Qrcode('qr-reader');
        await qrRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (txt) => {
            onScanRef.current(txt);
            try {
              if (qrRef.current?.isScanning) {
                await qrRef.current.stop();
                qrRef.current.clear();
              }
            } catch {}
            onCloseRef.current();
          },
          () => {}
        );
      } catch {
        alert('Camera Error');
        onCloseRef.current();
      }
    }, 300);

    return () => {
      clearTimeout(t);
      if (qrRef.current) {
        try {
          if (qrRef.current.isScanning) {
            qrRef.current
              .stop()
              .then(() => qrRef.current?.clear())
              .catch(() => {});
          } else {
            qrRef.current.clear();
          }
        } catch {}
        qrRef.current = null;
      }
    };
  }, [isOpen]); // ✅ only isOpen — callbacks via refs

  if (!isOpen) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'white', padding: 20, borderRadius: 12,
          width: '90%', maxWidth: 400,
        }}
      >
        <h3 style={{ marginTop: 0, textAlign: 'center' }}>📷 Scan</h3>
        <div
          id="qr-reader"
          style={{ width: '100%', minHeight: 250, background: '#000' }}
        />
        <button
          onClick={onClose}
          style={{
            marginTop: 15, padding: 12, background: '#ef4444',
            color: 'white', border: 'none', borderRadius: 8,
            width: '100%', fontWeight: 'bold',
          }}
        >
          ✕ Close
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// IMAGE PREVIEW MODAL
// ═══════════════════════════════════════════════════════════
const ImagePreviewModal = ({
  isOpen, onClose, images, initialIndex = 0,
}) => {
  const [idx, setIdx] = useState(initialIndex);
  useEffect(() => { if (isOpen) setIdx(initialIndex); }, [initialIndex, isOpen]);
  if (!isOpen || !images?.length) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.95)',
        zIndex: 10000,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 15, right: 15,
          background: 'rgba(255,255,255,0.2)', border: 'none',
          color: 'white', borderRadius: '50%',
          width: 40, height: 40, fontSize: 20,
        }}
      >
        ✕
      </button>
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIdx((i) => (i - 1 + images.length) % images.length);
            }}
            style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: 'white', borderRadius: '50%',
              width: 50, height: 50, fontSize: 24,
            }}
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIdx((i) => (i + 1) % images.length);
            }}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: 'white', borderRadius: '50%',
              width: 50, height: 50, fontSize: 24,
            }}
          >
            ›
          </button>
        </>
      )}
      <img
        src={images[idx]} alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90%', maxHeight: '80vh',
          objectFit: 'contain', borderRadius: 8,
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// RECEIPT UPLOADER + VIEWER
// ═══════════════════════════════════════════════════════════
const ReceiptUploader = ({ receipts, setReceipts, disabled }) => {
  const fileRef = useRef(null);
  const camRef  = useRef(null);
  const [preview, setPreview] = useState({ open: false, index: 0 });

  const process = async (files) => {
    if (!files?.length) return;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const c = await compressReceiptImage(f);
        setReceipts((p) => [
          ...p,
          {
            file: c,
            preview: URL.createObjectURL(c),
            name: f.name,
            size: c.size,
          },
        ]);
      } catch {
        setReceipts((p) => [
          ...p,
          {
            file: f,
            preview: URL.createObjectURL(f),
            name: f.name,
            size: f.size,
          },
        ]);
      }
    }
  };

  return (
    <div>
      <input
        ref={fileRef} type="file" accept="image/*" multiple
        onChange={(e) => { process(Array.from(e.target.files)); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
      <input
        ref={camRef} type="file" accept="image/*" capture="environment"
        onChange={(e) => { process(Array.from(e.target.files)); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
      <div
        style={{
          border: '2px dashed #cbd5e1', borderRadius: 12,
          padding: receipts.length > 0 ? 15 : 30,
          textAlign: 'center', background: '#f8fafc',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {receipts.length === 0 && (
          <div style={{ fontSize: 40, marginBottom: 10 }}>🧾</div>
        )}
        <div
          style={{
            display: 'flex', gap: 10,
            justifyContent: 'center', marginTop: 10,
          }}
        >
          <button
            type="button"
            onClick={() => camRef.current?.click()}
            disabled={disabled}
            style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid #3b82f6', background: '#eff6ff',
              color: '#1e40af', fontWeight: 'bold', fontSize: 18,
            }}
          >
            📸
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid #8b5cf6', background: '#f5f3ff',
              color: '#6d28d9', fontWeight: 'bold', fontSize: 18,
            }}
          >
            🖼️
          </button>
        </div>
        {receipts.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))',
              gap: 8, marginTop: 12,
            }}
          >
            {receipts.map((r, i) => (
              <div
                key={i}
                style={{
                  position: 'relative', borderRadius: 8,
                  overflow: 'hidden', border: '2px solid #e2e8f0',
                }}
              >
                <img
                  src={r.preview} alt=""
                  onClick={() => setPreview({ open: true, index: i })}
                  style={{
                    width: '100%', height: 80, objectFit: 'cover',
                    cursor: 'pointer', display: 'block',
                  }}
                />
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReceipts((p) => {
                        const u = [...p];
                        if (u[i]?.preview?.startsWith('blob:'))
                          URL.revokeObjectURL(u[i].preview);
                        u.splice(i, 1);
                        return u;
                      });
                    }}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      background: 'rgba(239,68,68,0.9)',
                      border: 'none', color: 'white',
                      borderRadius: '50%', width: 20, height: 20,
                      fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <ImagePreviewModal
        isOpen={preview.open}
        onClose={() => setPreview({ open: false, index: 0 })}
        images={receipts.map((r) => r.preview)}
        initialIndex={preview.index}
      />
    </div>
  );
};

const ReceiptViewer = ({ images }) => {
  const [preview, setPreview] = useState({ open: false, index: 0 });
  if (!images?.length) return null;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {images.map((u, i) => (
          <img
            key={i} src={u} alt=""
            onClick={() => setPreview({ open: true, index: i })}
            style={{
              width: 50, height: 50, objectFit: 'cover',
              borderRadius: 6, border: '2px solid #e2e8f0',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
      <ImagePreviewModal
        isOpen={preview.open}
        onClose={() => setPreview({ open: false, index: 0 })}
        images={images}
        initialIndex={preview.index}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// ITEM SEARCHABLE SELECT
// ═══════════════════════════════════════════════════════════
const SearchableSelect = ({
  options, value, onChange, placeholder, showImages = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const sel = useMemo(
    () => (options || []).find((o) => o.id === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!search) return options || [];
    const s = search.toLowerCase().trim();
    return (options || []).filter((o) =>
      [o?.name, o?.sinhalaName, o?.itemCode, o?.barcode,
       o?.brand, o?.category].some(
        (f) => f && String(f).toLowerCase().includes(s)
      )
    );
  }, [options, search]);

  const getImg = (it) =>
    it?.imageUrl || it?.image || (it?.images && it.images[0]) || null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: 14, border: '1px solid #cbd5e1', borderRadius: 10,
          background: 'white', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: 16, minHeight: 48,
        }}
      >
        <span
          style={{
            color: sel ? '#1e293b' : '#94a3b8',
            fontWeight: sel ? '600' : 'normal',
          }}
        >
          {sel ? sel.name : placeholder}
        </span>
        <span style={{ color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute', top: '100%', width: '100%',
            background: 'white', border: '1px solid #cbd5e1',
            borderRadius: 10, marginTop: 5, zIndex: 1000,
            maxHeight: 450, overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          }}
        >
          <div
            style={{
              position: 'sticky', top: 0, background: 'white',
              zIndex: 1, borderBottom: '2px solid #e2e8f0',
            }}
          >
            <input
              autoFocus
              placeholder="🔍 සොයන්න..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: 14, border: 'none',
                outline: 'none', boxSizing: 'border-box', fontSize: 16,
              }}
            />
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {filtered.map((o) => {
              const img   = getImg(o);
              const isSel = value === o.id;
              return (
                <div
                  key={o.id}
                  onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}
                  style={{
                    padding: 12, cursor: 'pointer',
                    background: isSel ? '#eff6ff' : 'white',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  {showImages && (
                    <div
                      style={{
                        width: 60, height: 60, flexShrink: 0,
                        borderRadius: 8, overflow: 'hidden',
                        border: '2px solid #e2e8f0', background: '#f1f5f9',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {img ? (
                        <img
                          src={img} alt={o.name}
                          style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: 28, color: '#94a3b8' }}>
                          📦
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: '600', fontSize: 15,
                        color: '#1e293b', marginBottom: 4,
                      }}
                    >
                      {isSel && '✓ '}{o.name}
                    </div>
                    <div
                      style={{
                        display: 'flex', gap: 8,
                        flexWrap: 'wrap', fontSize: 11,
                      }}
                    >
                      {o.barcode && (
                        <span
                          style={{
                            color: '#0369a1', background: '#f0f9ff',
                            padding: '2px 6px', borderRadius: 4,
                          }}
                        >
                          📊 {o.barcode}
                        </span>
                      )}
                      {o.itemCode && (
                        <span
                          style={{
                            color: '#16a34a', background: '#f0fdf4',
                            padding: '2px 6px', borderRadius: 4,
                          }}
                        >
                          🔖 {o.itemCode}
                        </span>
                      )}
                    </div>
                    {o.stock !== undefined && (
                      <div
                        style={{
                          marginTop: 4, fontSize: 11, fontWeight: '600',
                          color: o.stock > 0 ? '#16a34a' : '#dc2626',
                        }}
                      >
                        📦 {o.stock}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: 40, textAlign: 'center', color: '#64748b',
                }}
              >
                🔍 හමු නොවීය
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PRICE BOX
// ═══════════════════════════════════════════════════════════
const PriceBox = ({
  title, icon, bgColor, borderColor, textColor, accentBg,
  price, disc, yourPrice,
  onPriceChange, onDiscChange, onYourPriceChange,
  priceLabel = 'Price', yourPriceLabel = 'Your Price',
}) => {
  const inp = {
    width: '100%', padding: 10, borderRadius: 8,
    border: '1px solid #cbd5e1', outline: 'none',
    fontSize: 14, textAlign: 'center', boxSizing: 'border-box',
  };
  return (
    <div
      style={{
        background: bgColor, padding: 15, borderRadius: 10,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div
        style={{
          fontWeight: 'bold', color: textColor,
          marginBottom: 10,
          borderBottom: `1px solid ${borderColor}`, paddingBottom: 5,
        }}
      >
        {icon} {title}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block', marginBottom: 5,
              fontSize: 12, fontWeight: 'bold', color: '#475569',
            }}
          >
            {priceLabel}
          </label>
          <input
            type="number" value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            style={inp}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block', marginBottom: 5,
              fontSize: 12, fontWeight: 'bold', color: '#d97706',
            }}
          >
            Disc%
          </label>
          <input
            type="number" value={disc}
            onChange={(e) => onDiscChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            style={{
              ...inp,
              border: '2px solid #f59e0b', background: '#fffbeb',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block', marginBottom: 5,
              fontSize: 12, fontWeight: 'bold', color: textColor,
            }}
          >
            {yourPriceLabel} ✏️
          </label>
          <input
            type="number" value={yourPrice}
            onChange={(e) => onYourPriceChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            style={{
              ...inp,
              border: `2px solid ${textColor}`,
              background: accentBg, color: textColor, fontWeight: 'bold',
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// EXPIRY DATE BADGE
// ═══════════════════════════════════════════════════════════
const ExpiryBadge = ({ expiryDate, size = 'normal' }) => {
  const info = getExpiryStatus(expiryDate);
  if (!info) return null;
  const isSmall = size === 'small';
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center',
        gap: isSmall ? 4 : 6,
        padding: isSmall ? '2px 8px' : '4px 12px',
        borderRadius: 20, fontSize: isSmall ? 10 : 12, fontWeight: 700,
        background: info.bg, color: info.color,
        border: `1px solid ${info.border}`,
      }}
    >
      <span>{info.icon}</span>
      <span>{isSmall ? formatExpiryDate(expiryDate) : info.label}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// INVOICE STATUS HELPER
// ═══════════════════════════════════════════════════════════
const getInvStatus = (inv) => {
  const b = toNum(inv.balance);
  const p = toNum(inv.paidAmount);
  return b <= 0.01 ? 'paid' : p > 0 ? 'partial' : 'credit';
};

// ═══════════════════════════════════════════════════════════
// PAYMENT MODAL
// ═══════════════════════════════════════════════════════════
const PaymentModal = ({
  isOpen, onClose, invoice, onPaymentSaved,
  collectionName, bankAccounts, bankLoading, user,
}) => {
  const [payAmount, setPayAmount]   = useState('');
  const [payMethod, setPayMethod]   = useState('cash');
  const [bankId, setBankId]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [payReceipts, setPayReceipts] = useState([]);
  const savingRef = useRef(false);

  useEffect(() => {
    if (isOpen && invoice) {
      const bal = toNum(invoice.balance);
      setPayAmount(bal > 0 ? bal.toFixed(2) : '');
      setPayMethod('cash'); setBankId(''); setPayReceipts([]);
      savingRef.current = false;
    }
  }, [isOpen, invoice]);

  useEffect(() => {
    if (payMethod !== 'bank') setBankId('');
  }, [payMethod]);

  const handlePay = async () => {
    if (savingRef.current || saving) return;
    const amount  = parseFloat(payAmount) || 0;
    const balance = toNum(invoice.balance);
    if (amount <= 0) return alert('❌ මුදල ඇතුළත් කරන්න');
    if (amount > balance + 0.01)
      return alert(`❌ උපරිම: ${formatCurrency(balance)}`);
    if (payMethod === 'bank' && !bankId)
      return alert('❌ බැංකු ගිණුම තෝරන්න');

    savingRef.current = true; setSaving(true);
    try {
      const roundedAmount = Math.round(amount * 100) / 100;
      let urls = [];
      for (const r of payReceipts) {
        if (!r.file) continue;
        const res = await uploadOneImage(
          r.file,
          `payments/${user.uid}/${Date.now()}_${r.name}`
        );
        if (res.url) urls.push(res.url);
      }
      const selBank = bankAccounts.find((b) => b.id === bankId);
      await addDoc(collection(db, 'payments'), {
        invoiceId:       invoice.id,
        supplierId:      invoice.supplierId || '',
        supplierName:    invoice.supplierName || '',
        amount:          roundedAmount,
        method:          payMethod,
        bankAccountId:   payMethod === 'bank' ? bankId || null : null,
        bankAccountName: payMethod === 'bank' ? selBank?.accountName || '' : '',
        bankName:        payMethod === 'bank' ? selBank?.bankName || '' : '',
        uid:             user.uid,
        type:            invoice.type || 'purchase',
        receiptImages:   urls, receiptUrl: urls[0] || '',
        date:            localISODate(), time: nowHHMM(),
        createdAt:       serverTimestamp(),
      });

      const newPaid = Math.round(
        (toNum(invoice.paidAmount) + roundedAmount) * 100
      ) / 100;
      const gt      = toNum(invoice.grandTotal);
      let newBal    = Math.round((gt - newPaid) * 100) / 100;
      if (newBal < 0.01) newBal = 0;

      await updateDoc(doc(db, collectionName, invoice.id), {
        paidAmount:      newPaid,
        balance:         newBal,
        paymentStatus:   newBal <= 0.01 ? 'paid' : 'partial',
        lastPaymentDate: serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });

      if (payMethod === 'bank' && bankId) {
        try {
          await addDoc(
            collection(db, `users/${user.uid}/bankTransactions`),
            {
              type:        'withdrawal',
              accountId:   bankId,
              amount:      roundedAmount,
              date:        Timestamp.now(),
              description: `Purchase Payment — ${invoice.supplierName}`,
              reference:   invoice.refNo || invoice.id,
              source:      'purchase',
              invoiceId:   invoice.id,
              createdAt:   serverTimestamp(),
              updatedAt:   serverTimestamp(),
            }
          );
        } catch {}
      }

      await savePurchaseCashTransaction({
        user, amount: roundedAmount,
        supplierId:      invoice.supplierId,
        supplierName:    invoice.supplierName,
        invoiceId:       invoice.id,
        invoiceNo:       invoice.refNo || invoice.id,
        paymentMethod:   payMethod,
        bankAccountId:   payMethod === 'bank' ? bankId : null,
        bankAccountName: payMethod === 'bank' ? selBank?.accountName || '' : '',
        bankName:        payMethod === 'bank' ? selBank?.bankName || '' : '',
        notes:           'Purchase payment',
        items:           invoice.items || [],
        date:            localISODate(), time: nowHHMM(),
      });

      if (invoice.supplierId)
        await updateSupplierBalanceFields(
          invoice.supplierId, roundedAmount, 'subtract'
        );

      alert(`✅ සාර්ථකයි! ඉතිරිය: ${formatCurrency(newBal)}`);
      onPaymentSaved?.(); onClose();
    } catch (e) {
      alert('❌ ' + e.message);
    } finally {
      setSaving(false); savingRef.current = false;
    }
  };

  if (!isOpen || !invoice) return null;
  const balance      = toNum(invoice.balance);
  const isBankMissing = payMethod === 'bank' && !bankId;
  const payAmountNum  = parseFloat(payAmount) || 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: 16, width: '100%',
          maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#1e40af', padding: 20,
            borderRadius: '16px 16px 0 0', color: 'white',
            display: 'flex', justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>💳 ගෙවීම</h3>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>
              {invoice.supplierName}
            </div>
          </div>
          <button
            onClick={onClose} disabled={saving}
            style={{
              background: 'transparent', border: 'none',
              color: 'white', fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Balance summary */}
          <div
            style={{
              background: '#fef3c7', padding: 15,
              borderRadius: 10, marginBottom: 15,
            }}
          >
            <div
              style={{
                display: 'flex', justifyContent: 'space-between',
                marginBottom: 5,
              }}
            >
              <span>සම්පූර්ණ:</span>
              <b>{formatCurrency(invoice.grandTotal)}</b>
            </div>
            <div
              style={{
                display: 'flex', justifyContent: 'space-between',
                marginBottom: 5,
              }}
            >
              <span style={{ color: '#15803d' }}>ගෙවූ:</span>
              <b style={{ color: '#15803d' }}>
                {formatCurrency(invoice.paidAmount)}
              </b>
            </div>
            <div
              style={{
                display: 'flex', justifyContent: 'space-between',
                borderTop: '2px solid #fde047', paddingTop: 8,
              }}
            >
              <span style={{ color: '#991b1b', fontWeight: 'bold' }}>
                ඉතිරිය:
              </span>
              <b style={{ color: '#991b1b', fontSize: 18 }}>
                {formatCurrency(balance)}
              </b>
            </div>
          </div>

          {/* Amount input */}
          <input
            type="number" value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%', padding: 14, borderRadius: 10,
              border: '2px solid #3b82f6', fontSize: 22,
              fontWeight: 'bold', textAlign: 'center',
              boxSizing: 'border-box', marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
            <button
              type="button"
              onClick={() => setPayAmount((balance / 2).toFixed(2))}
              disabled={saving}
              style={{
                flex: 1, padding: 8, borderRadius: 8,
                border: '1px solid #cbd5e1', background: '#f1f5f9',
              }}
            >
              ½
            </button>
            <button
              type="button"
              onClick={() => setPayAmount(balance.toFixed(2))}
              disabled={saving}
              style={{
                flex: 1, padding: 8, borderRadius: 8,
                border: '1px solid #3b82f6', background: '#eff6ff',
                color: '#1e40af', fontWeight: 'bold',
              }}
            >
              Full
            </button>
          </div>

          {/* Payment method */}
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>
              ගෙවීම් ක්‍රමය
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)', gap: 8,
              }}
            >
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.v} type="button"
                  onClick={() => setPayMethod(m.v)} disabled={saving}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: payMethod === m.v
                      ? `2px solid ${m.c}`
                      : '2px solid #e2e8f0',
                    background: payMethod === m.v ? `${m.c}12` : 'white',
                    color: payMethod === m.v ? m.c : '#64748b',
                    fontWeight: payMethod === m.v ? 700 : 500, fontSize: 14,
                  }}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'bank' && (
            <div
              style={{
                marginBottom: 15, padding: 16,
                background: '#eff6ff', borderRadius: 12,
                border: '2px solid #bfdbfe',
              }}
            >
              <BankAccountSelector
                value={bankId} onChange={setBankId}
                bankAccounts={bankAccounts} loading={bankLoading}
                disabled={saving} showDeductInfo
                deductAmount={payAmountNum}
              />
            </div>
          )}

          <ReceiptUploader
            receipts={payReceipts}
            setReceipts={setPayReceipts}
            disabled={saving}
          />

          <button
            type="button"
            onClick={handlePay}
            disabled={saving || isBankMissing || payAmountNum <= 0}
            style={{
              width: '100%', padding: 16, borderRadius: 12, border: 'none',
              fontSize: 18, fontWeight: 'bold', color: 'white',
              background:
                saving || isBankMissing || payAmountNum <= 0
                  ? '#94a3b8' : '#16a34a',
              marginTop: 15,
            }}
          >
            {saving
              ? '⏳...'
              : isBankMissing
              ? '🏦 ගිණුම තෝරන්න'
              : payAmountNum <= 0
              ? '💳 මුදල ඇතුළත් කරන්න'
              : `💳 ${formatCurrency(payAmountNum)} ගෙවන්න`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// INVOICE CARD
// ═══════════════════════════════════════════════════════════
const InvoiceCard = ({
  inv, collectionName, onPayClick, onUpdate, onDeleteInvoice, S,
}) => {
  const [expanded, setExpanded]   = useState(false);
  const [payments, setPayments]   = useState([]);
  const [loadingPay, setLoadingPay] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  const displayReceipts =
    inv.receiptImages?.length > 0
      ? inv.receiptImages
      : inv.receiptUrl
      ? [inv.receiptUrl]
      : [];

  const items      = inv.items || [];
  const balance    = toNum(inv.balance);
  const paidAmount = toNum(inv.paidAmount);
  const grandTotal = toNum(inv.grandTotal || inv.totalAmount || inv.total);
  const status     =
    balance <= 0.01 ? 'paid' : paidAmount > 0 ? 'partial' : 'credit';

  const badgeStyle = S?.badge
    ? S.badge(status)
    : {
        padding: '4px 12px', borderRadius: 20,
        fontSize: 11, fontWeight: 'bold', display: 'inline-block',
        background:
          status === 'paid'
            ? '#dcfce7'
            : status === 'partial'
            ? '#fef3c7'
            : '#fee2e2',
        color:
          status === 'paid'
            ? '#16a34a'
            : status === 'partial'
            ? '#d97706'
            : '#dc2626',
      };

  // Earliest expiry among items
  const soonestExpiry = useMemo(() => {
    const withExpiry = items.filter((item) => item.expiryDate);
    if (!withExpiry.length) return null;
    return withExpiry.reduce((earliest, item) => {
      if (!earliest) return item.expiryDate;
      return new Date(item.expiryDate) < new Date(earliest)
        ? item.expiryDate
        : earliest;
    }, null);
  }, [items]);

  const loadPayments = async (force = false) => {
    if (!inv.id || (payments.length > 0 && !force) || loadingPay) return;
    setLoadingPay(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'payments'),
          where('invoiceId', '==', inv.id)
        )
      );
      setPayments(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.createdAt?.toDate?.()?.getTime() || 0) -
              (a.createdAt?.toDate?.()?.getTime() || 0)
          )
      );
    } catch {}
    setLoadingPay(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`"${inv.supplierName}" මකන්නද?`)) return;
    setDeleting(true);
    try {
      if (items.length > 0) {
        await Promise.allSettled(
          items.map((item) => {
            const qty = toNum(item.qty || item.quantity);
            if (!item.itemId || qty <= 0) return Promise.resolve();
            return updateDoc(doc(db, 'items', item.itemId), {
              stock:              increment(-qty),
              currentStock:       increment(-qty),
              'stocks.Main_Store': increment(-qty), // ✅ consistent
            }).catch(() => {});
          })
        );
      }
      await deleteDoc(doc(db, collectionName, inv.id));
      if (onDeleteInvoice && inv.supplierId && balance > 0)
        await onDeleteInvoice(inv.supplierId, balance);
      alert('✅ මකා දමන ලදී!'); onUpdate?.();
    } catch (e) {
      alert('❌ ' + e.message);
    }
    setDeleting(false);
  };

  return (
    <div
      style={{
        background: 'white', borderRadius: 12, marginBottom: 12,
        border: `1px solid ${
          status === 'paid'
            ? '#86efac'
            : status === 'partial'
            ? '#fcd34d'
            : '#fca5a5'
        }`,
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div
        onClick={() => {
          if (!expanded) loadPayments();
          setExpanded(!expanded);
        }}
        style={{
          padding: 15, cursor: 'pointer',
          background: expanded ? '#f8fafc' : 'white',
        }}
      >
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', gap: 10,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center',
                gap: 8, flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                {inv.supplierName || 'Unknown'}
              </span>
              <span style={badgeStyle}>
                {status === 'paid'
                  ? '✅'
                  : status === 'partial'
                  ? '🟡'
                  : '🔴'}{' '}
                {status.toUpperCase()}
              </span>
            </div>
            <div
              style={{
                display: 'flex', gap: 12, marginTop: 6,
                flexWrap: 'wrap', fontSize: 12, color: '#64748b',
              }}
            >
              <span>📄 {inv.refNo || '-'}</span>
              <span>📅 {formatDate(inv.date || inv.createdAt)}</span>
              <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>
                📦 {items.length}
              </span>
            </div>
            {soonestExpiry && (
              <div style={{ marginTop: 6 }}>
                <ExpiryBadge expiryDate={soonestExpiry} size="small" />
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', minWidth: 120 }}>
            <div
              style={{
                fontSize: 20, fontWeight: 'bold', color: '#1e40af',
              }}
            >
              {formatCurrency(grandTotal)}
            </div>
            {balance > 0.01 && (
              <div
                style={{
                  fontSize: 13, color: '#dc2626', fontWeight: 'bold',
                }}
              >
                Due: {formatCurrency(balance)}
              </div>
            )}
            <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 4 }}>
              {expanded ? '▲' : '▼'}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid #e2e8f0' }}>
          {/* Items */}
          <div style={{ padding: 15 }}>
            <h4
              style={{
                margin: '0 0 10px', color: '#475569', fontSize: 14,
              }}
            >
              📦 Items ({items.length})
            </h4>
            {items.map((item, i) => {
              const q   = toNum(item.qty || item.quantity);
              const net =
                toNum(
                  item.buyingNetPrice || item.netPrice || item.unitPrice
                ) ||
                calcNetPrice(
                  item.buyingPrice || item.price,
                  item.discountPercent || item.discount
                );
              const lt =
                toNum(item.totalCost || item.total || item.lineTotal) ||
                q * net;
              return (
                <div
                  key={i}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid #f1f5f9',
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <b>{item.name || item.itemName}</b>{' '}
                      <span style={{ color: '#64748b' }}>
                        ({q} × {net.toFixed(2)})
                      </span>
                    </div>
                    <div style={{ fontWeight: 'bold', flexShrink: 0 }}>
                      {lt.toFixed(2)}
                    </div>
                  </div>
                  {item.expiryDate && (
                    <div
                      style={{
                        marginTop: 4, display: 'flex',
                        alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        📅 Exp:
                      </span>
                      <ExpiryBadge
                        expiryDate={item.expiryDate} size="small"
                      />
                    </div>
                  )}
                  {item.batchNo && (
                    <div
                      style={{
                        fontSize: 11, color: '#7c3aed', marginTop: 2,
                      }}
                    >
                      🏷️ Batch: {item.batchNo}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Receipts */}
          {displayReceipts.length > 0 && (
            <div style={{ padding: '0 15px 15px' }}>
              <ReceiptViewer images={displayReceipts} />
            </div>
          )}

          {/* Payments history */}
          <div style={{ padding: '0 15px 15px' }}>
            <h4
              style={{
                margin: '0 0 8px', color: '#475569', fontSize: 14,
              }}
            >
              💳 Payments
            </h4>
            {loadingPay ? (
              <span style={{ fontSize: 13, color: '#94a3b8' }}>⏳</span>
            ) : payments.length === 0 ? (
              <span style={{ fontSize: 13, color: '#94a3b8' }}>
                No records
              </span>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: 10,
                    background: '#f8fafc', marginBottom: 6,
                    borderRadius: 8, border: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <b style={{ color: '#16a34a', fontSize: 15 }}>
                      {formatCurrency(p.amount)}
                    </b>
                    <div
                      style={{
                        fontSize: 11, color: '#64748b', marginTop: 2,
                      }}
                    >
                      {p.method === 'bank' && p.bankName
                        ? `🏦 ${p.bankName}`
                        : p.method === 'cash'
                        ? '💵 Cash'
                        : p.method || ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {formatDate(p.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div
            style={{
              padding: '0 15px 15px',
              display: 'flex', gap: 10,
            }}
          >
            {balance > 0.01 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPayClick?.(inv); }}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, border: 'none',
                  background: '#3b82f6', color: 'white', fontWeight: 'bold',
                }}
              >
                💳 Pay {formatCurrency(balance)}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              disabled={deleting}
              style={{
                padding: '12px 20px', borderRadius: 10,
                border: '1px solid #fca5a5', background: '#fef2f2',
                color: '#dc2626', fontWeight: 'bold',
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? '⏳' : '🗑️'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// SUPPLIER OUTSTANDING CARD
// ═══════════════════════════════════════════════════════════
const SupplierOutstandingCard = ({ group, onPayInvoice }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: 'white', borderRadius: 12,
        border: '1px solid #fca5a5',
        marginBottom: 10, overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: 15, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: '#1e293b' }}>
            {group.supplierName}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Unpaid Bills: {group.invoices.length}
          </div>
          <div
            style={{
              display: 'flex', gap: 12,
              flexWrap: 'wrap', marginTop: 6, fontSize: 12,
            }}
          >
            <span style={{ color: '#dc2626', fontWeight: 700 }}>
              ණය ශේෂය: {formatCurrency(group.totalBalance)}
            </span>
            <span style={{ color: '#7c3aed', fontWeight: 700 }}>
              බිල් එකතුව: {formatCurrency(group.invoiceTotal)}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>
            {open ? '▲' : '▼'}
          </div>
        </div>
      </div>
      {open && (
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            padding: 12, background: '#f8fafc',
          }}
        >
          {group.invoices.length > 0 ? (
            group.invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: 10, padding: 12, marginBottom: 8,
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    📄 {inv.refNo || inv.id.slice(0, 8)}
                  </div>
                  <div
                    style={{
                      fontSize: 12, color: '#64748b', marginTop: 3,
                    }}
                  >
                    {formatDate(inv.date || inv.createdAt)}
                  </div>
                  <div
                    style={{
                      fontSize: 12, color: '#16a34a', marginTop: 3,
                    }}
                  >
                    Total:{' '}
                    {formatCurrency(
                      inv.grandTotal || inv.totalAmount || inv.total
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: 18, fontWeight: 800, color: '#dc2626',
                    }}
                  >
                    {formatCurrency(inv.balance)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onPayInvoice(inv)}
                    style={{
                      marginTop: 6, padding: '6px 14px', borderRadius: 8,
                      border: 'none', background: '#3b82f6',
                      color: 'white', fontWeight: 'bold', fontSize: 12,
                    }}
                  >
                    💳 Pay
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                background: 'white', border: '1px solid #e2e8f0',
                borderRadius: 10, padding: 16,
                textAlign: 'center', color: '#64748b',
              }}
            >
              Unpaid invoice rows නැත.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function PurchaseCommonForm({
  title      = 'Purchase Invoice',
  type       = 'purchase',
  storageKey = 'purchases',
}) {
  const { user } = useUserAuth();

  // ─── State ───
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankLoading, setBankLoading]   = useState(true);
  const [activeTab, setActiveTab]       = useState('new');
  const [suppliers, setSuppliers]       = useState([]);
  const [items, setItems]               = useState([]);
  const [history, setHistory]           = useState([]);
  const [cart, setCart]                 = useState([]);
  const [isSaving, setIsSaving]         = useState(false);
  const isSavingRef                     = useRef(false);
  const [showScanner, setShowScanner]   = useState(false);
  const [searchTerm, setSearchTerm]     = useState('');
  const [saveStep, setSaveStep]         = useState('');
  const [receiptImages, setReceiptImages] = useState([]);
  const [paymentModal, setPaymentModal]   = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [historyFilter, setHistoryFilter]     = useState('all');
  const [sortBy, setSortBy]                   = useState('date-desc');

  // Tab change warning modal
  const [tabWarning, setTabWarning]   = useState(false);
  const [pendingTab, setPendingTab]   = useState(null);

  const [formData, setFormData] = useState({
    supplierId: '', supplierName: '',
    refNo: '', date: localISODate(), notes: '',
  });
  const [paymentData, setPaymentData] = useState({
    payNow: 0, paymentMethod: 'cash',
    paymentNote: '', bankAccountId: '',
  });
  const [lineItem, setLineItem] = useState({ ...INIT_LINE_ITEM });

  // ─── Bank accounts (real-time) ───
  useEffect(() => {
    if (!user?.uid) { setBankAccounts([]); setBankLoading(false); return; }
    setBankLoading(true);
    const unsub = onSnapshot(
      collection(db, `users/${user.uid}/bankAccounts`),
      (snap) => {
        setBankAccounts(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((a) => a.isActive !== false)
            .sort((a, b) =>
              (a.bankName || '').localeCompare(b.bankName || '')
            )
        );
        setBankLoading(false);
      },
      () => { setBankAccounts([]); setBankLoading(false); }
    );
    return () => unsub();
  }, [user?.uid]);

  // ─── Suppliers + Items (real-time) ───
  useEffect(() => {
    if (!user?.uid) return;
    const unsubS = onSnapshot(
      query(collection(db, 'suppliers'), where('uid', '==', user.uid)),
      (snap) =>
        setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('suppliers:', err)
    );
    const unsubI = onSnapshot(
      query(collection(db, 'items'), where('uid', '==', user.uid)),
      (snap) =>
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('items:', err)
    );
    return () => { unsubS(); unsubI(); };
  }, [user?.uid]);

  // ─── History (real-time) ───
  useEffect(() => {
    if (!user?.uid || activeTab === 'new') return;
    const q = query(
      collection(db, storageKey),
      where('uid', '==', user.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const dA = a.createdAt?.toDate?.()?.getTime() ??
              new Date(a.date || 0).getTime();
            const dB = b.createdAt?.toDate?.()?.getTime() ??
              new Date(b.date || 0).getTime();
            return dB - dA;
          });
        setHistory(data);
      },
      (err) => console.error('history:', err)
    );
    return () => unsub();
  }, [user?.uid, storageKey, activeTab]);

  // ─── Before unload warning ───
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = 'Cart items will be lost!';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cart.length]);

  // ─── Tab change (with modal warning) ───
  const handleTabChange = useCallback((tab) => {
    if (tab !== 'new' && cart.length > 0) {
      setPendingTab(tab); setTabWarning(true); return;
    }
    setActiveTab(tab);
  }, [cart.length]);

  const confirmTabChange = useCallback(() => {
    setActiveTab(pendingTab);
    setTabWarning(false); setPendingTab(null);
  }, [pendingTab]);

  // ─── Price handler ───
  const hPrice = useCallback((section, field, value) => {
    const c = PRICE_FIELDS[section];
    if (!c) return;
    setLineItem((prev) => {
      const u      = { ...prev };
      const numVal = toNum(value);
      if (field === 'price') {
        u[c.p] = value;
        u[c.y] = parseFloat(
          calcNetPrice(numVal, toNum(prev[c.d])).toFixed(2)
        );
      } else if (field === 'disc') {
        u[c.d] = value;
        u[c.y] = parseFloat(
          calcNetPrice(toNum(prev[c.p]), numVal).toFixed(2)
        );
      } else if (field === 'yourPrice') {
        u[c.y] = value;
        const p = toNum(prev[c.p]);
        u[c.d] =
          p > 0
            ? parseFloat((((p - numVal) / p) * 100).toFixed(2))
            : 0;
      }
      return u;
    });
  }, []);

  // ─── Item select ───
  const handleItemSelect = useCallback(
    (id) => {
      const item = items.find((i) => i.id === id);
      if (!item) return setLineItem({ ...INIT_LINE_ITEM });
      const bp = getBuyingPrice(item);
      const bd = getBuyingDiscount(item);
      setLineItem({
        ...INIT_LINE_ITEM,
        itemId: item.id, name: item.name,
        buyingPrice: bp, discountPercent: bd,
        buyingNetPrice: parseFloat(calcNetPrice(bp, bd).toFixed(2)),
        retailPrice: toNum(
          item.sellingPriceRetail || item.retailPrice ||
          item.sellingPrice || 0
        ),
        retailDiscount: toNum(item.retailDiscount || 0),
        retailYourPrice:
          toNum(item.retailYourPrice) ||
          parseFloat(
            calcNetPrice(
              toNum(item.sellingPriceRetail || item.retailPrice || 0),
              toNum(item.retailDiscount || 0)
            ).toFixed(2)
          ),
        wholesalePrice: toNum(
          item.sellingPriceWholesale || item.wholesalePrice || 0
        ),
        wholesaleDiscount: toNum(item.wholesaleDiscount || 0),
        wholesaleYourPrice:
          toNum(item.wholesaleYourPrice) ||
          parseFloat(
            calcNetPrice(
              toNum(item.sellingPriceWholesale || 0),
              toNum(item.wholesaleDiscount || 0)
            ).toFixed(2)
          ),
        loosePrice: toNum(
          item.sellingPriceLoose || item.loosePrice || 0
        ),
        looseDiscount: toNum(item.looseDiscount || 0),
        looseYourPrice:
          toNum(item.looseYourPrice) ||
          parseFloat(
            calcNetPrice(
              toNum(item.sellingPriceLoose || 0),
              toNum(item.looseDiscount || 0)
            ).toFixed(2)
          ),
        barcode: item.barcode || '',
        warranty: item.warranty || '',
        expiryDate: item.expiryDate || '',
        batchNo: item.batchNo || '',
      });
    },
    [items]
  );

  // ─── Add to cart ───
  const addToCart = useCallback(() => {
    if (!lineItem.itemId) return alert('❌ Item select කරන්න');
    const qty = toNum(lineItem.qty);
    if (qty <= 0) return alert('❌ Qty > 0');

    if (lineItem.expiryDate) {
      const expiryInfo = getExpiryStatus(lineItem.expiryDate);
      if (
        expiryInfo &&
        (expiryInfo.status === 'expired' || expiryInfo.status === 'today')
      ) {
        if (
          !window.confirm(
            `⚠️ මෙම භාණ්ඩය ${expiryInfo.label}!\n\nතවමත් cart එකට එකතු කරන්නද?`
          )
        )
          return;
      } else if (expiryInfo && expiryInfo.status === 'soon') {
        if (!window.confirm(`🟠 මෙම භාණ්ඩය ${expiryInfo.label}.\n\nContinue?`))
          return;
      }
    }

    setCart((p) => [
      ...p,
      {
        ...lineItem, qty,
        totalCost:
          Math.round(qty * toNum(lineItem.buyingNetPrice) * 100) / 100,
      },
    ]);
    setLineItem({ ...INIT_LINE_ITEM });
  }, [lineItem]);

  // ─── Cart qty update ───
  const updateCartQty = useCallback((index, newQty) => {
    setCart((p) =>
      p.map((item, i) => {
        if (i !== index) return item;
        const q = Math.max(0.01, toNum(newQty));
        return {
          ...item, qty: q,
          totalCost: Math.round(q * toNum(item.buyingNetPrice) * 100) / 100,
        };
      })
    );
  }, []);

  // ─── Save invoice ───
  const handleSave = async () => {
    // ✅ Validation FIRST — before state changes
    if (!formData.supplierId) return alert('❌ සැපයුම්කරු තෝරන්න!');
    if (cart.length === 0) return alert('❌ භාණ්ඩ එකතු කරන්න');

    const rawPayNow  = parseFloat(paymentData.payNow) || 0;
    const grandTotal = Math.round(
      cart.reduce((s, i) => s + (i.totalCost || 0), 0) * 100
    ) / 100;

    if (rawPayNow > grandTotal + 0.01)
      return alert(`❌ ගෙවීම ඉක්මවා ඇත: ${formatCurrency(grandTotal)}`);
    if (
      paymentData.paymentMethod === 'bank' &&
      rawPayNow > 0 &&
      !paymentData.bankAccountId
    )
      return alert('❌ බැංකු ගිණුම තෝරන්න');

    if (isSavingRef.current) return;
    isSavingRef.current = true; setIsSaving(true);

    try {
      const payNow = Math.min(
        Math.round(rawPayNow * 100) / 100, grandTotal
      );
      let balance  = Math.round((grandTotal - payNow) * 100) / 100;
      if (balance < 0.01) balance = 0;
      const paymentStatus =
        balance <= 0.01 ? 'paid' : payNow > 0 ? 'partial' : 'credit';

      const supObj = suppliers.find((s) => s.id === formData.supplierId);
      const sn     = supObj?.name || formData.supplierName || '';
      const sb     = bankAccounts.find(
        (b) => b.id === paymentData.bankAccountId
      );

      const cleanCart = cart.map((c) => {
        const q  = toNum(c.qty);
        const bp = toNum(c.buyingPrice);
        const dp = toNum(c.discountPercent);
        const np = toNum(c.buyingNetPrice) || calcNetPrice(bp, dp);
        const tc =
          toNum(c.totalCost) || Math.round(q * np * 100) / 100;
        return {
          itemId: c.itemId, name: c.name, qty: q,
          buyingPrice: bp, discountPercent: dp,
          buyingNetPrice: np, totalCost: tc,
          retailPrice:       toNum(c.retailPrice),
          retailDiscount:    toNum(c.retailDiscount),
          retailYourPrice:   toNum(c.retailYourPrice),
          wholesalePrice:    toNum(c.wholesalePrice),
          wholesaleDiscount: toNum(c.wholesaleDiscount),
          wholesaleYourPrice: toNum(c.wholesaleYourPrice),
          loosePrice:        toNum(c.loosePrice),
          looseDiscount:     toNum(c.looseDiscount),
          looseYourPrice:    toNum(c.looseYourPrice),
          barcode: c.barcode || '', warranty: c.warranty || '',
          expiryDate: c.expiryDate || '',
          batchNo: c.batchNo || '',
          // Legacy aliases
          itemName: c.name, quantity: q, price: bp,
          unitPrice: np, netPrice: np, total: tc, lineTotal: tc,
        };
      });

      // Save invoice
      setSaveStep('💾 Invoice save...');
      const invRef = await addDoc(collection(db, storageKey), {
        supplierId:    formData.supplierId,
        supplier_id:   formData.supplierId,
        supplierName:  sn,
        uid:           user.uid,
        refNo:         formData.refNo || '',
        date:          formData.date || localISODate(),
        notes:         formData.notes || '',
        type, items:   cleanCart,
        grandTotal, totalAmount: grandTotal, total: grandTotal,
        paidAmount:    payNow,
        balance,
        paymentStatus,
        receiptImages: [], receiptUrl: '',
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });

      // Upload receipts
      let imageUrls = [];
      if (receiptImages.length > 0) {
        for (let i = 0; i < receiptImages.length; i++) {
          setSaveStep(`📤 Image ${i + 1}/${receiptImages.length}...`);
          const r = receiptImages[i];
          if (!r.file) continue;
          const res = await uploadOneImage(
            r.file,
            `receipts/${user.uid}/${invRef.id}/${Date.now()}_${r.name}`
          );
          if (res.url) imageUrls.push(res.url);
        }
        if (imageUrls.length > 0) {
          try {
            await updateDoc(doc(db, storageKey, invRef.id), {
              receiptImages: imageUrls,
              receiptUrl: imageUrls[0],
            });
          } catch {}
        }
      }

      // Payment
      if (payNow > 0) {
        setSaveStep('💳 Payment...');
        await addDoc(collection(db, 'payments'), {
          invoiceId:       invRef.id,
          supplierId:      formData.supplierId,
          supplier_id:     formData.supplierId,
          supplierName:    sn,
          amount:          payNow,
          method:          paymentData.paymentMethod,
          note:            paymentData.paymentNote || 'Initial',
          bankAccountId:
            paymentData.paymentMethod === 'bank'
              ? paymentData.bankAccountId || null
              : null,
          bankAccountName:
            paymentData.paymentMethod === 'bank'
              ? sb?.accountName || ''
              : '',
          bankName:
            paymentData.paymentMethod === 'bank'
              ? sb?.bankName || ''
              : '',
          uid:           user.uid,
          type:          type || 'purchase',
          receiptImages: imageUrls,
          receiptUrl:    imageUrls[0] || '',
          createdAt:     serverTimestamp(),
        });

        if (
          paymentData.paymentMethod === 'bank' &&
          paymentData.bankAccountId
        ) {
          try {
            await addDoc(
              collection(db, `users/${user.uid}/bankTransactions`),
              {
                type:        'withdrawal',
                accountId:   paymentData.bankAccountId,
                amount:      payNow,
                date:        Timestamp.now(),
                description: `Purchase — ${sn}`,
                reference:   formData.refNo || invRef.id,
                source:      'purchase',
                invoiceId:   invRef.id,
                createdAt:   serverTimestamp(),
                updatedAt:   serverTimestamp(),
              }
            );
          } catch {}
        }

        await savePurchaseCashTransaction({
          user, amount: payNow,
          supplierId:      formData.supplierId,
          supplierName:    sn,
          invoiceId:       invRef.id,
          invoiceNo:       formData.refNo || invRef.id,
          paymentMethod:   paymentData.paymentMethod,
          bankAccountId:
            paymentData.paymentMethod === 'bank'
              ? paymentData.bankAccountId
              : null,
          bankAccountName:
            paymentData.paymentMethod === 'bank'
              ? sb?.accountName || ''
              : '',
          bankName:
            paymentData.paymentMethod === 'bank'
              ? sb?.bankName || ''
              : '',
          notes: paymentData.paymentNote || formData.notes || '',
          items: cleanCart,
          date:  formData.date || localISODate(),
          time:  nowHHMM(),
        });
      }

      // Supplier balance (credit only)
      if (balance > 0 && formData.supplierId) {
        setSaveStep('📊 Balance...');
        await updateSupplierBalanceFields(
          formData.supplierId, balance, 'add'
        );
      }

      // Stock + price update
      setSaveStep('📦 Stock...');
      await Promise.allSettled(
        cleanCart.map((item) =>
          updateDoc(doc(db, 'items', item.itemId), {
            stock:              increment(item.qty),
            currentStock:       increment(item.qty),
            'stocks.Main_Store': increment(item.qty), // ✅ consistent
            buyingPrice:         item.buyingPrice,
            buyingDiscount:      item.discountPercent,
            buyingNetPrice:      item.buyingNetPrice,
            sellingPriceRetail:  item.retailPrice,
            retailDiscount:      item.retailDiscount,
            retailYourPrice:     item.retailYourPrice,
            sellingPriceWholesale: item.wholesalePrice,
            wholesaleDiscount:   item.wholesaleDiscount,
            wholesaleYourPrice:  item.wholesaleYourPrice,
            sellingPriceLoose:   item.loosePrice,
            looseDiscount:       item.looseDiscount,
            looseYourPrice:      item.looseYourPrice,
            barcode:             item.barcode,
            warranty:            item.warranty,
            ...(item.expiryDate
              ? {
                  expiryDate:     item.expiryDate,
                  lastExpiryDate: item.expiryDate,
                }
              : {}),
            ...(item.batchNo
              ? { batchNo: item.batchNo, lastBatchNo: item.batchNo }
              : {}),
            updatedAt: serverTimestamp(),
          })
        )
      );

      setSaveStep('');
      alert(
        paymentStatus === 'paid'
          ? `✅ සම්පූර්ණයි! ${cleanCart.length} items`
          : `✅ Saved! Balance: ${formatCurrency(balance)}`
      );

      // Reset form
      setCart([]);
      setLineItem({ ...INIT_LINE_ITEM });
      setReceiptImages([]);
      setPaymentData({
        payNow: 0, paymentMethod: 'cash',
        paymentNote: '', bankAccountId: '',
      });
      setFormData((prev) => ({ ...prev, refNo: '', notes: '' }));
    } catch (e) {
      setSaveStep(''); alert('❌ ' + e.message);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
      setSaveStep('');
    }
  };

  // ─── Derived values ───
  const cartTotal = useMemo(
    () => toNum(cart.reduce((s, i) => s + (i.totalCost || 0), 0)),
    [cart]
  );

  const currentPayNow  = parseFloat(paymentData.payNow) || 0;
  const currentBalance = Math.max(
    0, Math.round((cartTotal - currentPayNow) * 100) / 100
  );
  const needsBank  = paymentData.paymentMethod === 'bank' && currentPayNow > 0;
  const bankMissing = needsBank && !paymentData.bankAccountId;

  const totalSupplierDebt = useMemo(
    () =>
      Math.round(
        suppliers.reduce((sum, s) => {
          const bal = getSupplierBalance(s);
          return sum + (bal > 0 ? bal : 0);
        }, 0) * 100
      ) / 100,
    [suppliers]
  );

  const totalBillsOutstanding = useMemo(() => {
    const seen = new Set(); let total = 0;
    history.forEach((inv) => {
      if (seen.has(inv.id)) return;
      seen.add(inv.id);
      total += toNum(inv.balance);
    });
    return Math.round(total * 100) / 100;
  }, [history]);

  const totalPurchases = useMemo(
    () =>
      toNum(
        history.reduce(
          (s, i) => s + toNum(i.grandTotal || i.totalAmount || i.total),
          0
        )
      ),
    [history]
  );

  const totalPaid = useMemo(
    () => toNum(history.reduce((s, i) => s + toNum(i.paidAmount), 0)),
    [history]
  );

  // Expiry stats — hoisted today date ✅
  const expiryStats = useMemo(() => {
    const today = new Date();
    let expired = 0, soon = 0, warning = 0;
    history.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        const info = getExpiryStatus(item.expiryDate, today);
        if (!info) return;
        if (info.status === 'expired' || info.status === 'today') expired++;
        else if (info.status === 'soon') soon++;
        else if (info.status === 'warning') warning++;
      });
    });
    return { expired, soon, warning };
  }, [history]);

  // Filtered + sorted history — pre-calculated expiry ✅
  const filteredHistory = useMemo(() => {
    const today = new Date();
    const withMeta = history.map((inv) => ({
      ...inv,
      _status: getInvStatus(inv),
      _earliestExpiry: (inv.items || [])
        .filter((i) => i.expiryDate)
        .reduce((min, i) => {
          const t = new Date(i.expiryDate).getTime();
          return t < min ? t : min;
        }, Infinity),
    }));

    return withMeta
      .filter((inv) =>
        historyFilter === 'all' || inv._status === historyFilter
      )
      .filter((inv) => {
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (
          (inv.supplierName || '').toLowerCase().includes(t) ||
          (inv.refNo || '').toLowerCase().includes(t) ||
          (inv.items || []).some((item) =>
            (item.name || item.itemName || '').toLowerCase().includes(t)
          )
        );
      })
      .sort((a, b) => {
        if (sortBy === 'amount-desc')
          return toNum(b.grandTotal) - toNum(a.grandTotal);
        if (sortBy === 'balance-desc')
          return toNum(b.balance) - toNum(a.balance);
        if (sortBy === 'expiry-asc')
          return a._earliestExpiry - b._earliestExpiry;
        const dA =
          a.createdAt?.toDate?.()?.getTime() ??
          new Date(a.date || 0).getTime();
        const dB =
          b.createdAt?.toDate?.()?.getTime() ??
          new Date(b.date || 0).getTime();
        return dB - dA;
      });
  }, [history, historyFilter, searchTerm, sortBy]);

  // Outstanding groups — invoice-based balance ✅
  const groupedOutstanding = useMemo(() => {
    const map = new Map();
    const seenInvoices = new Set();

    suppliers.forEach((s) => {
      map.set(s.id, {
        sid: s.id,
        supplierName: s.name || 'Unknown',
        totalBalance: 0,
        invoiceTotal: 0,
        invoices: [],
      });
    });

    history
      .filter((inv) => toNum(inv.balance) > 0.01)
      .forEach((inv) => {
        if (seenInvoices.has(inv.id)) return;
        seenInvoices.add(inv.id);
        const sid = inv.supplierId || inv.supplier_id || '';
        if (!sid) return;
        if (!map.has(sid)) {
          map.set(sid, {
            sid,
            supplierName: inv.supplierName || 'Unknown',
            totalBalance: 0, invoiceTotal: 0, invoices: [],
          });
        }
        const row      = map.get(sid);
        const invBal   = toNum(inv.balance);
        row.totalBalance += invBal;
        row.invoiceTotal += invBal;
        row.invoices.push(inv);
      });

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        totalBalance: Math.round(g.totalBalance * 100) / 100,
        invoiceTotal: Math.round(g.invoiceTotal * 100) / 100,
      }))
      .filter((g) => g.invoices.length > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }, [suppliers, history]);

  // ─── Styles ───
  const S = useMemo(() => ({
    box: {
      padding: 20, maxWidth: 1200, margin: '0 auto',
      fontFamily: '-apple-system, sans-serif',
    },
    card: {
      background: 'white', padding: 20, borderRadius: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 20,
    },
    inp: {
      width: '100%', padding: 10, borderRadius: 8,
      border: '1px solid #cbd5e1', outline: 'none',
      fontSize: 14, textAlign: 'center', boxSizing: 'border-box',
    },
    lbl: {
      display: 'block', marginBottom: 5,
      fontSize: 12, fontWeight: 'bold', color: '#475569',
    },
    btn: {
      padding: '10px 20px', borderRadius: 8, border: 'none',
      cursor: 'pointer', fontWeight: 'bold',
      background: '#3b82f6', color: 'white',
    },
    tab: (active) => ({
      padding: '12px 24px', borderRadius: '10px 10px 0 0',
      border: 'none', cursor: 'pointer',
      fontWeight: 'bold', fontSize: 14,
      background: active ? 'white' : '#e2e8f0',
      color: active ? '#1e40af' : '#64748b',
      borderBottom: active ? '3px solid #3b82f6' : 'none',
    }),
    badge: (st) => ({
      padding: '4px 12px', borderRadius: 20,
      fontSize: 11, fontWeight: 'bold', display: 'inline-block',
      background:
        st === 'paid' ? '#dcfce7' : st === 'partial' ? '#fef3c7' : '#fee2e2',
      color:
        st === 'paid' ? '#16a34a' : st === 'partial' ? '#d97706' : '#dc2626',
    }),
  }), []);

  // ════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div style={S.box}>
      {/* Tab change warning modal */}
      <TabWarningModal
        isOpen={tabWarning}
        cartCount={cart.length}
        onConfirm={confirmTabChange}
        onCancel={() => { setTabWarning(false); setPendingTab(null); }}
      />

      {/* Scanner */}
      <ScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(v) => {
          setLineItem((p) => ({ ...p, barcode: v }));
          const found = items.find(
            (i) => i.barcode === v || i.itemCode === v
          );
          if (found) handleItemSelect(found.id);
        }}
      />

      {/* Payment modal */}
      <PaymentModal
        isOpen={paymentModal}
        onClose={() => { setPaymentModal(false); setSelectedInvoice(null); }}
        invoice={selectedInvoice}
        onPaymentSaved={() => {
          // history is real-time via onSnapshot — no manual refresh needed
        }}
        collectionName={storageKey}
        bankAccounts={bankAccounts}
        bankLoading={bankLoading}
        user={user}
      />

      {bankLoading && (
        <div
          style={{
            padding: '8px 16px', background: '#fef3c7',
            borderRadius: 8, marginBottom: 10,
            fontSize: 13, color: '#92400e', textAlign: 'center',
          }}
        >
          ⏳ Loading...
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div
        style={{
          display: 'flex', gap: 5,
          borderBottom: '2px solid #e2e8f0',
        }}
      >
        <button
          type="button" style={S.tab(activeTab === 'new')}
          onClick={() => handleTabChange('new')}
        >
          📝 New
        </button>
        <button
          type="button" style={S.tab(activeTab === 'history')}
          onClick={() => handleTabChange('history')}
        >
          📋 History ({history.length})
        </button>
        <button
          type="button" style={S.tab(activeTab === 'payments')}
          onClick={() => handleTabChange('payments')}
        >
          💳 Payments
          {totalSupplierDebt > 0 && (
            <span
              style={{
                background: '#ef4444', color: 'white',
                borderRadius: 10, padding: '2px 8px',
                fontSize: 11, marginLeft: 6,
              }}
            >
              {formatCurrency(totalSupplierDebt)}
            </span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════
          NEW TAB
      ════════════════════════════════════════ */}
      {activeTab === 'new' && (
        <>
          {/* Invoice Header */}
          <div
            style={{
              ...S.card,
              marginTop: 0,
              borderRadius: '0 12px 12px 12px',
            }}
          >
            <h2 style={{ margin: '0 0 15px' }}>{title}</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 15,
              }}
            >
              <div>
                <label style={S.lbl}>Supplier *</label>
                <SupplierSearchableSelect
                  options={suppliers}
                  value={formData.supplierId}
                  onChange={(id) => {
                    const s = suppliers.find((x) => x.id === id);
                    setFormData((p) => ({
                      ...p, supplierId: id,
                      supplierName: s?.name || '',
                    }));
                  }}
                  onSupplierCreated={(newSupplier) => {
                    setSuppliers((prev) => [newSupplier, ...prev]);
                    setFormData((p) => ({
                      ...p,
                      supplierId: newSupplier.id,
                      supplierName: newSupplier.name,
                    }));
                  }}
                  placeholder="සැපයුම්කරු තෝරන්න / නව"
                  user={user}
                />
              </div>
              <div>
                <label style={S.lbl}>Ref No</label>
                <input
                  style={{ ...S.inp, textAlign: 'left' }}
                  value={formData.refNo}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, refNo: e.target.value }))
                  }
                />
              </div>
              <div>
                <label style={S.lbl}>Date</label>
                <input
                  type="date" style={S.inp} value={formData.date}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, date: e.target.value }))
                  }
                />
              </div>
              <div>
                <label style={S.lbl}>Notes</label>
                <input
                  style={{ ...S.inp, textAlign: 'left' }}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* ─── Add Item ─── */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 15px', fontSize: 18 }}>
              ➕ Add Item
            </h3>
            <div style={{ marginBottom: 15 }}>
              <SearchableSelect
                options={items}
                value={lineItem.itemId}
                onChange={handleItemSelect}
                placeholder="භාණ්ඩය සොයන්න..."
                showImages
              />
            </div>

            {/* Qty / Barcode / Warranty */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={S.lbl}>📦 Qty</label>
                <input
                  type="number" value={lineItem.qty}
                  onChange={(e) =>
                    setLineItem((p) => ({ ...p, qty: e.target.value }))
                  }
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: '100%', padding: 16, borderRadius: 12,
                    border: '2px solid #3b82f6', fontSize: 24,
                    fontWeight: '900', textAlign: 'center',
                    boxSizing: 'border-box', background: '#eff6ff',
                    color: '#1e40af', outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={S.lbl}>📊 Barcode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={lineItem.barcode}
                    onChange={(e) =>
                      setLineItem((p) => ({
                        ...p, barcode: e.target.value,
                      }))
                    }
                    style={{
                      flex: 1, padding: 16, borderRadius: 12,
                      border: '2px solid #f59e0b', fontSize: 16,
                      fontWeight: 'bold', textAlign: 'center',
                      boxSizing: 'border-box', background: '#fffbeb',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    style={{
                      padding: '14px 18px', borderRadius: 12,
                      border: '2px solid #f59e0b',
                      background: '#fef3c7', fontSize: 22,
                    }}
                  >
                    📷
                  </button>
                </div>
              </div>
              <div>
                <label style={S.lbl}>🔒 Warranty</label>
                <input
                  value={lineItem.warranty}
                  onChange={(e) =>
                    setLineItem((p) => ({
                      ...p, warranty: e.target.value,
                    }))
                  }
                  style={{
                    width: '100%', padding: 16, borderRadius: 12,
                    border: '1px solid #cbd5e1', fontSize: 16,
                    textAlign: 'center', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Expiry Date & Batch */}
            <div
              style={{
                marginTop: 15, padding: 16,
                background: 'linear-gradient(135deg, #fefce8, #fef9c3)',
                borderRadius: 12, border: '2px solid #fde047',
              }}
            >
              <div
                style={{
                  fontWeight: 'bold', color: '#854d0e',
                  marginBottom: 12, fontSize: 15,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                📅 කල් ඉකුත්වීම / Batch තොරතුරු
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block', marginBottom: 6,
                      fontSize: 12, fontWeight: 700, color: '#92400e',
                    }}
                  >
                    📅 කල් ඉකුත්වීමේ දිනය (Expiry Date)
                  </label>
                  <input
                    type="date"
                    value={lineItem.expiryDate}
                    onChange={(e) =>
                      setLineItem((p) => ({
                        ...p, expiryDate: e.target.value,
                      }))
                    }
                    min={localISODate()}
                    style={{
                      width: '100%', padding: 14, borderRadius: 10,
                      border: lineItem.expiryDate
                        ? `2px solid ${
                            getExpiryStatus(lineItem.expiryDate)
                              ?.border || '#fcd34d'
                          }`
                        : '2px solid #fcd34d',
                      background: lineItem.expiryDate
                        ? getExpiryStatus(lineItem.expiryDate)?.bg ||
                          '#fffbeb'
                        : '#fffbeb',
                      fontSize: 15, fontWeight: 600,
                      textAlign: 'center', boxSizing: 'border-box',
                      outline: 'none', color: '#854d0e',
                    }}
                  />
                  {lineItem.expiryDate && (
                    <div style={{ marginTop: 8 }}>
                      <ExpiryBadge expiryDate={lineItem.expiryDate} />
                    </div>
                  )}
                </div>
                <div>
                  <label
                    style={{
                      display: 'block', marginBottom: 6,
                      fontSize: 12, fontWeight: 700, color: '#92400e',
                    }}
                  >
                    🏷️ Batch / Lot අංකය
                  </label>
                  <input
                    value={lineItem.batchNo}
                    onChange={(e) =>
                      setLineItem((p) => ({
                        ...p, batchNo: e.target.value,
                      }))
                    }
                    placeholder="eg: BATCH-2024-001"
                    style={{
                      width: '100%', padding: 14, borderRadius: 10,
                      border: '2px solid #fcd34d', background: '#fffbeb',
                      fontSize: 15, fontWeight: 600,
                      textAlign: 'center', boxSizing: 'border-box',
                      outline: 'none', color: '#854d0e',
                    }}
                  />
                </div>
              </div>

              {/* Quick expiry buttons */}
              <div
                style={{
                  display: 'flex', gap: 6, marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                {[
                  { label: '+3 මාස', months: 3 },
                  { label: '+6 මාස', months: 6 },
                  { label: '+1 වසර', months: 12 },
                  { label: '+2 වසර', months: 24 },
                  { label: '+3 වසර', months: 36 },
                ].map((opt) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + opt.months);
                  const dateStr = localISODate(d);
                  return (
                    <button
                      key={opt.months} type="button"
                      onClick={() =>
                        setLineItem((p) => ({ ...p, expiryDate: dateStr }))
                      }
                      style={{
                        padding: '6px 12px', borderRadius: 8,
                        border:
                          lineItem.expiryDate === dateStr
                            ? '2px solid #f59e0b'
                            : '1px solid #e5e7eb',
                        background:
                          lineItem.expiryDate === dateStr
                            ? '#fef3c7' : 'white',
                        color: '#92400e', fontWeight: 600,
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {lineItem.expiryDate && (
                  <button
                    type="button"
                    onClick={() =>
                      setLineItem((p) => ({ ...p, expiryDate: '' }))
                    }
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      border: '1px solid #fca5a5',
                      background: '#fef2f2', color: '#dc2626',
                      fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>

            {/* Price Boxes */}
            <div
              style={{
                marginTop: 20, display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 15,
              }}
            >
              <PriceBox
                title="Buying Cost" icon="💰"
                bgColor="#fffbeb" borderColor="#fcd34d"
                textColor="#b45309" accentBg="#fef3c7"
                price={lineItem.buyingPrice}
                disc={lineItem.discountPercent}
                yourPrice={lineItem.buyingNetPrice}
                onPriceChange={(v) => hPrice('buying', 'price', v)}
                onDiscChange={(v) => hPrice('buying', 'disc', v)}
                onYourPriceChange={(v) => hPrice('buying', 'yourPrice', v)}
                priceLabel="Cost" yourPriceLabel="Net Cost"
              />
              <PriceBox
                title="Retail" icon="🏪"
                bgColor="#eff6ff" borderColor="#bfdbfe"
                textColor="#1e40af" accentBg="#dbeafe"
                price={lineItem.retailPrice}
                disc={lineItem.retailDiscount}
                yourPrice={lineItem.retailYourPrice}
                onPriceChange={(v) => hPrice('retail', 'price', v)}
                onDiscChange={(v) => hPrice('retail', 'disc', v)}
                onYourPriceChange={(v) => hPrice('retail', 'yourPrice', v)}
              />
              <PriceBox
                title="Wholesale" icon="🏭"
                bgColor="#faf5ff" borderColor="#e9d5ff"
                textColor="#6b21a8" accentBg="#f3e8ff"
                price={lineItem.wholesalePrice}
                disc={lineItem.wholesaleDiscount}
                yourPrice={lineItem.wholesaleYourPrice}
                onPriceChange={(v) => hPrice('wholesale', 'price', v)}
                onDiscChange={(v) => hPrice('wholesale', 'disc', v)}
                onYourPriceChange={(v) =>
                  hPrice('wholesale', 'yourPrice', v)
                }
              />
              <PriceBox
                title="Loose" icon="📦"
                bgColor="#fff7ed" borderColor="#fdba74"
                textColor="#c2410c" accentBg="#ffedd5"
                price={lineItem.loosePrice}
                disc={lineItem.looseDiscount}
                yourPrice={lineItem.looseYourPrice}
                onPriceChange={(v) => hPrice('loose', 'price', v)}
                onDiscChange={(v) => hPrice('loose', 'disc', v)}
                onYourPriceChange={(v) => hPrice('loose', 'yourPrice', v)}
              />
            </div>

            <button
              type="button" onClick={addToCart}
              disabled={!lineItem.itemId}
              style={{
                ...S.btn, marginTop: 20, width: '100%',
                padding: 18, fontSize: 18, borderRadius: 12,
                background: lineItem.itemId
                  ? 'linear-gradient(135deg, #3b82f6, #1e40af)'
                  : '#94a3b8',
              }}
            >
              ⬇ Add
            </button>
          </div>

          {/* ─── Cart ─── */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 15px' }}>
              🛒 Cart ({cart.length})
            </h3>
            {!cart.length && (
              <div
                style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}
              >
                Cart හිස්.
              </div>
            )}
            {cart.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0', borderBottom: '1px solid #f1f5f9',
                }}
              >
                <div style={{ flex: 2 }}>
                  <b>{c.name}</b>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    × {toNum(c.buyingNetPrice).toFixed(2)}
                    {toNum(c.discountPercent) > 0 && (
                      <span style={{ color: '#d97706' }}>
                        {' '}(-{c.discountPercent}%)
                      </span>
                    )}
                  </div>
                  {c.expiryDate && (
                    <div style={{ marginTop: 4 }}>
                      <ExpiryBadge expiryDate={c.expiryDate} size="small" />
                    </div>
                  )}
                  {c.batchNo && (
                    <div
                      style={{
                        fontSize: 11, color: '#7c3aed', marginTop: 2,
                      }}
                    >
                      🏷️ {c.batchNo}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: 8, marginTop: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateCartQty(i, c.qty - 1)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: '1px solid #cbd5e1', background: '#f1f5f9',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: 16,
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        fontWeight: 700, minWidth: 32,
                        textAlign: 'center', fontSize: 16,
                      }}
                    >
                      {c.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(i, c.qty + 1)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: '1px solid #cbd5e1', background: '#f1f5f9',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: 16,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    flex: 1, textAlign: 'right', fontWeight: 'bold',
                    fontSize: 16, color: '#1e40af',
                  }}
                >
                  {(c.totalCost || 0).toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCart((p) => p.filter((_, x) => x !== i))
                  }
                  style={{
                    color: '#ef4444', background: 'none', border: 'none',
                    fontSize: 20, marginLeft: 10,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            {cart.length > 0 && (
              <>
                {/* Totals */}
                <div
                  style={{
                    padding: 20, background: '#f8fafc', borderRadius: 12,
                    border: '2px solid #e2e8f0', marginTop: 15,
                  }}
                >
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 'bold' }}>
                      Total:
                    </span>
                    <span
                      style={{
                        fontSize: 18, fontWeight: 'bold', color: '#1e40af',
                      }}
                    >
                      {formatCurrency(cartTotal)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 16, color: '#16a34a', fontWeight: 'bold',
                      }}
                    >
                      Pay Now:
                    </span>
                    <span
                      style={{
                        fontSize: 18, fontWeight: 'bold', color: '#16a34a',
                      }}
                    >
                      {formatCurrency(currentPayNow)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      borderTop: '2px dashed #cbd5e1', paddingTop: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18, color: '#dc2626', fontWeight: 'bold',
                      }}
                    >
                      Balance:
                    </span>
                    <span
                      style={{
                        fontSize: 24, fontWeight: '900',
                        color: currentBalance > 0 ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {formatCurrency(currentBalance)}
                    </span>
                  </div>
                </div>

                {/* Expiry summary */}
                {cart.some((c) => c.expiryDate) && (
                  <div
                    style={{
                      marginTop: 15, padding: 14, borderRadius: 12,
                      background: '#fffbeb',
                      border: '2px solid #fde047',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700, color: '#854d0e',
                        marginBottom: 8, fontSize: 14,
                      }}
                    >
                      📅 කල් ඉකුත්වීමේ සාරාංශය
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {cart
                        .filter((c) => c.expiryDate)
                        .map((c, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '4px 10px', borderRadius: 8,
                              background: 'white',
                              border: '1px solid #e5e7eb', fontSize: 12,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                            <ExpiryBadge
                              expiryDate={c.expiryDate} size="small"
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Receipts */}
                <div
                  style={{
                    background: '#fefce8', padding: 20, borderRadius: 12,
                    border: '2px solid #fde047', marginTop: 15,
                  }}
                >
                  <h4 style={{ margin: '0 0 12px', color: '#854d0e' }}>
                    🧾 රිසිට්පත්
                  </h4>
                  <ReceiptUploader
                    receipts={receiptImages}
                    setReceipts={setReceiptImages}
                    disabled={isSaving}
                  />
                </div>

                {/* Payment section */}
                <div
                  style={{
                    background: '#f0fdf4', padding: 20, borderRadius: 12,
                    border: '2px solid #86efac', marginTop: 15,
                  }}
                >
                  <h4 style={{ margin: '0 0 15px', color: '#166534' }}>
                    💳 ගෙවීම
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 15, marginBottom: 16,
                    }}
                  >
                    <div>
                      <label style={{ ...S.lbl, color: '#166534' }}>
                        Pay Now
                      </label>
                      <input
                        type="number"
                        style={{
                          ...S.inp, fontSize: 18, fontWeight: 'bold',
                          border: '2px solid #22c55e',
                        }}
                        value={paymentData.payNow}
                        onChange={(e) =>
                          setPaymentData((p) => ({
                            ...p, payNow: e.target.value,
                          }))
                        }
                        onFocus={(e) => e.target.select()}
                      />
                      <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentData((p) => ({
                              ...p,
                              payNow: (cartTotal / 2).toFixed(2),
                            }))
                          }
                          style={{
                            flex: 1, padding: 6, fontSize: 11,
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            background: '#f1f5f9',
                          }}
                        >
                          ½
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentData((p) => ({
                              ...p,
                              payNow: cartTotal.toFixed(2),
                            }))
                          }
                          style={{
                            flex: 1, padding: 6, fontSize: 11,
                            fontWeight: 'bold', borderRadius: 6,
                            border: '1px solid #22c55e',
                            background: '#dcfce7', color: '#166534',
                          }}
                        >
                          Full
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ ...S.lbl, color: '#166534' }}>
                        ක්‍රමය
                      </label>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2,1fr)', gap: 6,
                        }}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.v} type="button"
                            onClick={() =>
                              setPaymentData((p) => ({
                                ...p,
                                paymentMethod: m.v,
                                bankAccountId:
                                  m.v !== 'bank' ? '' : p.bankAccountId,
                              }))
                            }
                            style={{
                              padding: '8px 12px', borderRadius: 8,
                              border:
                                paymentData.paymentMethod === m.v
                                  ? `2px solid ${m.c}`
                                  : '2px solid #e2e8f0',
                              background:
                                paymentData.paymentMethod === m.v
                                  ? `${m.c}12` : 'white',
                              color:
                                paymentData.paymentMethod === m.v
                                  ? m.c : '#64748b',
                              fontWeight:
                                paymentData.paymentMethod === m.v
                                  ? 700 : 500,
                              fontSize: 13,
                            }}
                          >
                            {m.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {needsBank && (
                    <div
                      style={{
                        padding: 16, background: 'white',
                        borderRadius: 12,
                        border: '2px solid #bfdbfe', marginTop: 4,
                      }}
                    >
                      <BankAccountSelector
                        value={paymentData.bankAccountId}
                        onChange={(id) =>
                          setPaymentData((p) => ({
                            ...p, bankAccountId: id,
                          }))
                        }
                        bankAccounts={bankAccounts}
                        loading={bankLoading}
                        disabled={isSaving}
                        showDeductInfo
                        deductAmount={currentPayNow}
                      />
                    </div>
                  )}
                </div>

                {saveStep && (
                  <div
                    style={{
                      marginTop: 10, padding: 15, background: '#eff6ff',
                      borderRadius: 10, textAlign: 'center',
                      color: '#1e40af', fontWeight: 'bold',
                    }}
                  >
                    ⏳ {saveStep}
                  </div>
                )}

                <button
                  type="button" onClick={handleSave}
                  disabled={isSaving || !formData.supplierId || bankMissing}
                  style={{
                    ...S.btn,
                    background:
                      isSaving || !formData.supplierId || bankMissing
                        ? '#94a3b8'
                        : 'linear-gradient(135deg, #16a34a, #22c55e)',
                    marginTop: 20, width: '100%',
                    padding: 18, fontSize: 18, borderRadius: 12,
                  }}
                >
                  {isSaving
                    ? `⏳ ${saveStep || 'Save...'}`
                    : bankMissing
                    ? '🏦 බැංකු ගිණුම තෝරන්න'
                    : !formData.supplierId
                    ? '⚠️ Supplier තෝරන්න'
                    : `💾 Save — ${formatCurrency(cartTotal)}`}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════
          HISTORY TAB
      ════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div>
          {/* Summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12, marginBottom: 20,
            }}
          >
            {[
              {
                label: 'Total Purchases', value: totalPurchases,
                bg: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              },
              {
                label: 'Total Paid', value: totalPaid,
                bg: 'linear-gradient(135deg, #166534, #22c55e)',
              },
              {
                label: 'ණය ශේෂය', value: totalSupplierDebt,
                bg:
                  totalSupplierDebt > 0
                    ? 'linear-gradient(135deg, #991b1b, #ef4444)'
                    : 'linear-gradient(135deg, #166534, #22c55e)',
              },
              {
                label: 'බිල් ඉතිරිය', value: totalBillsOutstanding,
                bg:
                  totalBillsOutstanding > 0
                    ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                    : 'linear-gradient(135deg, #166534, #22c55e)',
              },
            ].map((card, idx) => (
              <div
                key={idx}
                style={{
                  background: card.bg, padding: 16,
                  borderRadius: 12, color: 'white',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: 22, fontWeight: 'bold', marginTop: 4,
                  }}
                >
                  {formatCurrency(card.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Expiry alert */}
          {(expiryStats.expired > 0 || expiryStats.soon > 0) && (
            <div
              style={{
                padding: 14, borderRadius: 12, marginBottom: 16,
                background:
                  expiryStats.expired > 0 ? '#fef2f2' : '#fff7ed',
                border: `2px solid ${
                  expiryStats.expired > 0 ? '#fca5a5' : '#fdba74'
                }`,
                display: 'flex', alignItems: 'center',
                gap: 12, flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 24 }}>
                {expiryStats.expired > 0 ? '🔴' : '🟠'}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    color:
                      expiryStats.expired > 0 ? '#991b1b' : '#9a3412',
                    fontSize: 14,
                  }}
                >
                  කල් ඉකුත් භාණ්ඩ ඇත!
                </div>
                <div
                  style={{
                    fontSize: 12, color: '#64748b', marginTop: 4,
                    display: 'flex', gap: 12,
                  }}
                >
                  {expiryStats.expired > 0 && (
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>
                      🔴 Expired: {expiryStats.expired}
                    </span>
                  )}
                  {expiryStats.soon > 0 && (
                    <span style={{ color: '#ea580c', fontWeight: 700 }}>
                      🟠 Soon: {expiryStats.soon}
                    </span>
                  )}
                  {expiryStats.warning > 0 && (
                    <span style={{ color: '#d97706', fontWeight: 700 }}>
                      🟡 Warning: {expiryStats.warning}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={S.card}>
            <div
              style={{
                display: 'flex', gap: 10,
                flexWrap: 'wrap', marginBottom: 15,
              }}
            >
              <input
                placeholder="🔍 Search..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  ...S.inp, textAlign: 'left',
                  flex: '1 1 300px', padding: 12,
                }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  ...S.inp, textAlign: 'left',
                  width: 'auto', minWidth: 160,
                }}
              >
                <option value="date-desc">📅 Latest</option>
                <option value="amount-desc">💰 Highest</option>
                <option value="balance-desc">🔴 Balance</option>
                <option value="expiry-asc">📅 Expiry Soon</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { v: 'all',     l: 'All',        c: '#3b82f6' },
                { v: 'credit',  l: '🔴 Credit',  c: '#ef4444' },
                { v: 'partial', l: '🟡 Partial',  c: '#f59e0b' },
                { v: 'paid',    l: '🟢 Paid',     c: '#22c55e' },
              ].map((f) => (
                <button
                  key={f.v} type="button"
                  onClick={() => setHistoryFilter(f.v)}
                  style={{
                    padding: '8px 16px', borderRadius: 8,
                    border:
                      historyFilter === f.v
                        ? `2px solid ${f.c}`
                        : '1px solid #e2e8f0',
                    color: historyFilter === f.v ? f.c : '#64748b',
                    background: 'white', cursor: 'pointer',
                    fontWeight: historyFilter === f.v ? 700 : 400,
                  }}
                >
                  {f.l} (
                  {
                    history.filter(
                      (i) => f.v === 'all' || getInvStatus(i) === f.v
                    ).length
                  }
                  )
                </button>
              ))}
            </div>
          </div>

          {!filteredHistory.length ? (
            <div
              style={{
                ...S.card, textAlign: 'center',
                padding: 40, color: '#94a3b8',
              }}
            >
              Invoices නැත
            </div>
          ) : (
            filteredHistory.map((inv) => (
              <InvoiceCard
                key={inv.id} inv={inv}
                collectionName={storageKey} S={S}
                onPayClick={(invoice) => {
                  setSelectedInvoice(invoice);
                  setPaymentModal(true);
                }}
                onUpdate={() => {
                  // real-time — no manual action needed
                }}
                onDeleteInvoice={async (supplierId, deletedBalance) => {
                  if (supplierId && deletedBalance > 0)
                    await updateSupplierBalanceFields(
                      supplierId, deletedBalance, 'subtract'
                    );
                }}
              />
            ))
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          PAYMENTS TAB
      ════════════════════════════════════════ */}
      {activeTab === 'payments' && (
        <div>
          <div style={S.card}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12, marginBottom: 20,
              }}
            >
              <div
                style={{
                  background: '#fef2f2', border: '2px solid #fca5a5',
                  borderRadius: 12, padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12, color: '#991b1b',
                    fontWeight: 700, marginBottom: 6,
                  }}
                >
                  සැපයුම්කරුගේ ණය ශේෂය
                </div>
                <div
                  style={{
                    fontSize: 28, fontWeight: 900, color: '#dc2626',
                  }}
                >
                  {formatCurrency(totalSupplierDebt)}
                </div>
              </div>
              <div
                style={{
                  background: '#f5f3ff', border: '2px solid #c4b5fd',
                  borderRadius: 12, padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12, color: '#6d28d9',
                    fontWeight: 700, marginBottom: 6,
                  }}
                >
                  ගෙවීමට ඇති බිල්පත් එකතුව
                </div>
                <div
                  style={{
                    fontSize: 28, fontWeight: 900, color: '#7c3aed',
                  }}
                >
                  {formatCurrency(totalBillsOutstanding)}
                </div>
              </div>
            </div>

            <div
              style={{
                marginBottom: 15, fontWeight: 700,
                fontSize: 18, color: '#1e293b',
              }}
            >
              🔴 Supplier-wise Outstanding
            </div>

            {groupedOutstanding.length > 0 ? (
              groupedOutstanding.map((g) => (
                <SupplierOutstandingCard
                  key={g.sid} group={g}
                  onPayInvoice={(inv) => {
                    setSelectedInvoice(inv);
                    setPaymentModal(true);
                  }}
                />
              ))
            ) : (
              <div
                style={{
                  textAlign: 'center', padding: 50, color: '#16a34a',
                }}
              >
                <div style={{ fontSize: 60, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                  සියලු ගෙවීම් සම්පූර්ණ!
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
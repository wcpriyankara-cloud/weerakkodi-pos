'use client';

// components/production/CustomerPicker.jsx

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  query, where, Timestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { T } from './translations';
import { S } from './styles';
import {
  normalizePhone, displayPhone, makePortalKey,
  getPortalLink, hasNativeContacts, blobToDataURL,
  readVCFFile,
} from './utils';
import { nn, fmt } from './utils';
import ContactPickerModal from './ContactPickerModal';

export default function CustomerPicker({
  lang,
  value,
  onChange,
  uid,
  onCustomerData,
}) {
  const t = T[lang] || T.si;
  const [customers,    setCustomers]    = useState([]);
  const [sc,           setSc]           = useState('');
  const [open,         setOpen]         = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [sel,          setSel]          = useState(null);
  const [newName,      setNewName]      = useState('');
  const [newPhone,     setNewPhone]     = useState('');
  const [newAddress,   setNewAddress]   = useState('');
  const [newPhoto,     setNewPhoto]     = useState('');
  const [adding,       setAdding]       = useState(false);
  const [addMsg,       setAddMsg]       = useState('');
  const [importing,    setImporting]    = useState(false);
  const [vcfContacts,  setVcfContacts]  = useState(null);

  const ref     = useRef(null);
  const vcfRef  = useRef(null);
  const supportsNative = useMemo(() => hasNativeContacts(), []);

  // Load customers
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'customers'), where('uid', '==', uid)),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (docs.length > 0) {
          setCustomers(docs);
        } else {
          getDocs(collection(db, 'customers'))
            .then((as) => {
              const ad = as.docs.map((d) => ({ id: d.id, ...d.data() }));
              setCustomers(ad);
              ad.forEach((c) => {
                if (!c.uid) updateDoc(doc(db, 'customers', c.id), { uid }).catch(() => {});
              });
            })
            .catch(() => {});
        }
      }
    );
    return () => unsub();
  }, [uid]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setShowAdd(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Sync selected
  useEffect(() => {
    if (value && customers.length) {
      const f = customers.find((c) => c.name === value);
      if (f) setSel(f);
    } else {
      setSel(null);
    }
  }, [value, customers]);

  const filtered = useMemo(() => {
    if (!sc.trim()) return customers.slice(0, 20);
    const s  = sc.toLowerCase().trim();
    const sn = normalizePhone(s);
    return customers
      .filter((c) => {
        const name  = (c.name || '').toLowerCase();
        const phone = c.phone || '';
        const pn    = normalizePhone(phone);
        return name.includes(s) || phone.includes(s) || (sn && pn.includes(sn));
      })
      .slice(0, 20);
  }, [customers, sc]);

  const applyContact = useCallback(
    (name, phone, photo) => {
      const np2      = normalizePhone(phone);
      const existing = customers.find(
        (c) =>
          (np2 && normalizePhone(c.phone) === np2) ||
          (name.trim() && (c.name || '').toLowerCase() === name.toLowerCase().trim())
      );
      if (existing) {
        setSel(existing);
        onChange(existing.name);
        onCustomerData?.(existing);
        setOpen(false);
        setShowAdd(false);
        setVcfContacts(null);
        alert(t.existingCustomerFound);
        return;
      }
      setNewName(name);
      setNewPhone(np2);
      setNewPhoto(photo);
      setShowAdd(true);
      setOpen(false);
      setVcfContacts(null);
      setSc('');
    },
    [customers, onChange, onCustomerData, t]
  );

  const handleNative = async () => {
    if (!supportsNative) { alert(t.contactNotSupported); return; }
    setImporting(true);
    try {
      const props = ['name', 'tel'];
      try { props.push('icon'); } catch {}
      const contacts = await navigator.contacts.select(props, { multiple: false });
      if (!contacts || contacts.length === 0) return;
      const c     = contacts[0];
      const name  = Array.isArray(c.name)  ? (c.name[0]  || '') : (c.name  || '');
      const phone = Array.isArray(c.tel)   ? (c.tel[0]   || '') : (c.tel   || '');
      let photo = '';
      const icon = Array.isArray(c.icon) ? c.icon[0] : c.icon;
      if (icon instanceof Blob) {
        try { photo = await blobToDataURL(icon); } catch {}
      } else if (typeof icon === 'string' && icon.length > 10) {
        photo = icon;
      }
      applyContact(name, phone, photo);
    } catch (err) {
      if (err?.name !== 'AbortError') alert(t.contactNotSupported);
    } finally {
      setImporting(false);
    }
  };

  const handleVCF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const contacts = await readVCFFile(file);
      if (!contacts.length) { alert('No contacts'); return; }
      if (contacts.length === 1)
        applyContact(contacts[0].name, contacts[0].phone, contacts[0].photoDataUrl);
      else
        setVcfContacts(contacts);
    } catch {
      alert('VCF error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleVCFSel = useCallback(
    (c) => applyContact(c.name, c.phone, c.photoDataUrl),
    [applyContact]
  );

  const handleAdd = async () => {
    if (!newName.trim() || !uid) return;
    setAdding(true);
    try {
      const pk = makePortalKey(newName.trim());
      const r  = await addDoc(collection(db, 'customers'), {
        uid,
        name:            newName.trim(),
        phone:           normalizePhone(newPhone),
        address:         newAddress.trim(),
        currentBalance:  0,
        profilePicture:  newPhoto || '',
        photoURL:        newPhoto || '',
        portalAccessKey: pk,
        createdAt:       Timestamp.now(),
        updatedAt:       Timestamp.now(),
      });
      const nc = {
        id:              r.id,
        name:            newName.trim(),
        phone:           normalizePhone(newPhone),
        address:         newAddress.trim(),
        currentBalance:  0,
        portalAccessKey: pk,
        profilePicture:  newPhoto || '',
      };
      setSel(nc);
      onChange(nc.name);
      onCustomerData?.(nc);
      setAddMsg(t.customerAdded);
      setTimeout(() => setAddMsg(''), 2000);
      setNewName(''); setNewPhone(''); setNewAddress(''); setNewPhoto('');
      setShowAdd(false);
      setOpen(false);
      setSc('');
    } catch (e) {
      alert(e.message);
    } finally {
      setAdding(false);
    }
  };

  const select = (c) => {
    setSel(c);
    onChange(c.name);
    onCustomerData?.(c);
    setOpen(false);
    setSc('');
    setShowAdd(false);
  };

  const clear = () => {
    setSel(null);
    onChange('');
    onCustomerData?.(null);
    setSc('');
  };

  const openAdd = () => {
    const isP = /^[\d\+]/.test(sc.trim());
    if (isP) { setNewPhone(sc.trim()); setNewName(''); }
    else      { setNewName(sc.trim()); setNewPhone(''); }
    setNewAddress(''); setNewPhoto(''); setShowAdd(true);
  };

  // ── Add Form ──
  const AddForm = () => (
    <div style={{ padding: 16, background: '#f0f9ff', borderTop: '2px solid #93c5fd', borderRadius: '0 0 12px 12px' }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#1d4ed8', marginBottom: 12 }}>
        ➕ {t.addNewCustomer}
      </div>

      {newPhoto && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ position: 'relative' }}>
            <img
              src={newPhoto} alt=""
              style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '3px solid #3b82f6' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <button
              onClick={() => setNewPhoto('')}
              style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 10 }}
            >✕</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={newName}    onChange={(e) => setNewName(e.target.value)}    placeholder={`${t.newCustomerName} *`} style={{ ...S.inp, fontWeight: 600 }} autoFocus />
        <input value={newPhone}   onChange={(e) => setNewPhone(e.target.value)}   placeholder={t.newCustomerPhone} type="tel" inputMode="tel" style={S.inp} />
        {newPhone && <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>📱 {displayPhone(newPhone)}</div>}
        <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder={t.newCustomerAddress} style={S.inp} />

        <div style={{ display: 'flex', gap: 6 }}>
          {supportsNative && (
            <button type="button" onClick={handleNative} disabled={importing}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#6d28d9', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              {importing ? '⏳' : '📇'}
            </button>
          )}
          <button type="button" onClick={() => vcfRef.current?.click()} disabled={importing}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#6d28d9', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            {importing ? '⏳' : '📁'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleAdd} disabled={adding || !newName.trim()}
            style={{ flex: 1, padding: 12, borderRadius: 10, background: adding ? '#86efac' : '#16a34a', color: 'white', border: 'none', fontWeight: 900, cursor: adding || !newName.trim() ? 'not-allowed' : 'pointer', fontSize: 14 }}>
            {adding ? '⏳...' : `✅ ${t.addCustomer}`}
          </button>
          <button
            onClick={() => { setShowAdd(false); setNewName(''); setNewPhone(''); setNewAddress(''); setNewPhoto(''); }}
            style={{ padding: '12px 16px', borderRadius: 10, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {vcfContacts && (
        <ContactPickerModal contacts={vcfContacts} onSelect={handleVCFSel} onClose={() => setVcfContacts(null)} />
      )}
      <input type="file" ref={vcfRef} accept=".vcf,.vcard" style={{ display: 'none' }} onChange={handleVCF} />

      {/* Selected customer card */}
      {value && sel ? (
        <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 12, border: '2px solid #86efac' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {sel.profilePicture ? (
                <img src={sel.profilePicture} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #10b981' }} onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20 }}>
                  {(sel.name || '?')[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#166534' }}>👤 {sel.name}</div>
                {sel.phone && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📱 {displayPhone(sel.phone)}</div>}
                {sel.portalAccessKey && (
                  <a href={getPortalLink(sel.portalAccessKey)} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 999, textDecoration: 'none' }}>
                    {t.viewAccount} ↗
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: nn(sel.currentBalance) > 0 ? '#fef2f2' : '#f0fdf4', padding: '6px 12px', borderRadius: 8, border: `1px solid ${nn(sel.currentBalance) > 0 ? '#fecaca' : '#bbf7d0'}`, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: nn(sel.currentBalance) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{t.balance}</div>
                <div style={{ fontWeight: 900, color: nn(sel.currentBalance) > 0 ? '#dc2626' : '#16a34a', fontSize: 14 }}>
                  {nn(sel.currentBalance) > 0 ? `Rs.${fmt(sel.currentBalance)}` : '✅ 0.00'}
                </div>
              </div>
              <button onClick={clear} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: 16, borderRadius: 8, padding: '6px 10px' }}>✕</button>
            </div>
          </div>
        </div>
      ) : value ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: '#f0fdf4', borderRadius: 10, border: '2px solid #86efac', alignItems: 'center' }}>
          <strong>👤 {value}</strong>
          <button onClick={clear} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <input
                value={sc}
                onChange={(e) => { setSc(e.target.value); setOpen(true); setShowAdd(false); }}
                onFocus={() => setOpen(true)}
                placeholder={t.searchCustomer}
                style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, border: '2px solid #3b82f6', background: '#eff6ff', boxSizing: 'border-box', fontSize: 14 }}
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
            </div>
            {supportsNative && (
              <button type="button" onClick={handleNative} disabled={importing}
                style={{ padding: '10px 12px', background: importing ? '#cbd5e1' : 'linear-gradient(135deg,#6d28d9,#7c3aed)', color: 'white', border: 'none', borderRadius: 10, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                {importing ? '⏳' : '📇'} {t.importContacts}
              </button>
            )}
            <button type="button" onClick={() => vcfRef.current?.click()} disabled={importing}
              style={{ padding: '10px 12px', background: importing ? '#cbd5e1' : '#ede9fe', color: importing ? '#64748b' : '#6d28d9', border: '1px solid #ddd6fe', borderRadius: 10, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
              {importing ? '⏳' : '📁'} {t.importVCF}
            </button>
          </div>
          {addMsg && (
            <div style={{ padding: 8, background: '#dcfce7', borderRadius: 8, color: '#16a34a', fontWeight: 700, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
              {addMsg}
            </div>
          )}
        </>
      )}

      {/* Dropdown */}
      {open && !value && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 200, maxHeight: 380, overflowY: 'auto', marginTop: 4 }}>
          {filtered.map((c) => (
            <div key={c.id} onClick={() => select(c)}
              style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {c.profilePicture ? (
                  <img src={c.profilePicture} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #10b981' }} onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#667eea', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    {(c.name || '?')[0]}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>👤 {c.name}</div>
                  {c.phone && <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>📱 {displayPhone(c.phone)}</div>}
                </div>
              </div>
              {nn(c.currentBalance) > 0 ? (
                <div style={{ background: '#fef2f2', padding: '4px 10px', borderRadius: 6, fontWeight: 800, color: '#dc2626', fontSize: 12, border: '1px solid #fecaca' }}>
                  Rs.{fmt(c.currentBalance)}
                </div>
              ) : (
                <div style={{ background: '#f0fdf4', padding: '4px 8px', borderRadius: 6, fontWeight: 700, color: '#16a34a', fontSize: 11 }}>✅</div>
              )}
            </div>
          ))}

          {!filtered.length && sc.trim() && (
            <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>😕 {t.noResults}</div>
          )}

          {!showAdd && (
            <div onClick={openAdd}
              style={{ padding: 14, textAlign: 'center', cursor: 'pointer', background: '#f0f9ff', color: '#2563eb', fontWeight: 800, fontSize: 14, borderTop: '2px dashed #bfdbfe', borderRadius: '0 0 12px 12px' }}>
              {t.addNewCustomer}
            </div>
          )}
          {showAdd && <AddForm />}
        </div>
      )}

      {showAdd && !open && (
        <div style={{ marginTop: 8 }}>
          <AddForm />
        </div>
      )}
    </div>
  );
}
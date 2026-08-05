'use client';

// components/production/BillModal.jsx

import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, updateDoc, doc, query, where,
  Timestamp, increment, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { T } from './translations';
import { S } from './styles';
import { PAY_OPTIONS } from './constants';
import { nn, fmt, genInvoice, getPortalLink, displayPhone } from './utils';
import { syncIncome } from './cashSync';
import ShareActions from './ShareActions';

export default function BillModal({
  show,
  onClose,
  billData,
  lang,
  onPaymentSaved,
  uid,
  invSettings,
}) {
  const t = T[lang] || T.si;
  const [payments,          setPayments]          = useState([{ method: 'cash', amount: '' }]);
  const [saving,            setSaving]            = useState(false);
  const [done,              setDone]              = useState(false);
  const [custData,          setCustData]          = useState(null);
  const [accountLinkCopied, setAccountLinkCopied] = useState(false);
  const billRef = useRef(null);

  useEffect(() => {
    if (!show || !billData) return;
    setDone(false);
    setSaving(false);
    setAccountLinkCopied(false);
    setPayments([{ method: 'cash', amount: String(billData.grandTotal || '') }]);
    setCustData(null);
    if (billData.customerName && uid) {
      getDocs(
        query(collection(db, 'customers'), where('uid', '==', uid), where('name', '==', billData.customerName))
      ).then((s) => {
        if (!s.empty) setCustData({ id: s.docs[0].id, ...s.docs[0].data() });
      }).catch(() => {});
    }
  }, [show, billData, uid]);

  if (!show || !billData) return null;

  const previousDebt   = nn(billData.previousCustomerBalance ?? 0);
  const actualPayments = payments
    .map((p) => ({ method: p.method, amount: nn(p.amount) }))
    .filter((p) => p.method !== 'credit' && p.amount > 0);
  const creditSelected = payments.some((p) => p.method === 'credit');
  const totalPaid      = actualPayments.reduce((s, p) => s + p.amount, 0);
  const balance        = Math.max(0, nn(billData.grandTotal) - totalPaid);
  const totalDebt      = previousDebt + balance;
  const accountUrl     = getPortalLink(custData?.portalAccessKey || billData.customerPortalKey || '');
  const customerPhone  = custData?.phone || billData.customerPhone || '';

  const handleSave = async () => {
    if (!billData.entryId || done || !uid) return;
    setSaving(true);
    try {
      const cusId        = custData?.id || billData.customerId || '';
      const savedPayments = actualPayments.length > 0
        ? actualPayments
        : creditSelected ? [{ method: 'credit', amount: 0 }] : [];

      await updateDoc(doc(db, 'productionEntries', billData.entryId), {
        invoiceNumber:  billData.invoiceNo,
        payments:       savedPayments,
        totalPaid,
        balanceDue:     balance,
        paymentStatus:  balance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'pending',
        billGeneratedAt: Timestamp.now(),
      });

      if (cusId && totalPaid > 0) {
        try {
          await updateDoc(doc(db, 'customers', cusId), {
            currentBalance: increment(-totalPaid),
            updatedAt:      serverTimestamp(),
          });
        } catch {}
      }

      if (totalPaid > 0) {
        await syncIncome(uid, {
          entryId:       billData.entryId,
          invoiceNo:     billData.invoiceNo,
          batchNumber:   billData.batchNumber || '',
          customerName:  billData.customerName || '',
          customerId:    cusId,
          customerPhone,
          vehicleNumber: billData.vehicleNumber || '',
          businessType:  billData.businessType,
          businessName:  billData.businessName,
          businessIcon:  billData.businessIcon,
          payments:      actualPayments,
          date:          billData.date,
          shift:         billData.shift || '',
        });
      }

      setDone(true);
      onPaymentSaved?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    if (!accountUrl) return;
    try {
      await navigator.clipboard.writeText(accountUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = accountUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setAccountLinkCopied(true);
    setTimeout(() => setAccountLinkCopied(false), 3000);
  };

  const entryForShare = {
    ...billData,
    batchNumber:             billData.batchNumber || billData.invoiceNo,
    payments:                actualPayments,
    totalPaid,
    balanceDue:              balance,
    previousCustomerBalance: previousDebt,
    customerPortalKey:       custData?.portalAccessKey || billData.customerPortalKey || '',
  };

  return (
    <div style={S.overlay}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>

        <div ref={billRef}>
          {invSettings?.logo && (
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <img src={invSettings.logo} alt="Logo" style={{ maxHeight: 50 }} />
            </div>
          )}
          <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>{billData.businessIcon} {invSettings?.businessName || billData.businessName}</h2>
          {invSettings?.address && <p style={{ textAlign: 'center', margin: '0 0 2px', color: '#64748b', fontSize: 11 }}>📍 {invSettings.address}</p>}
          {invSettings?.phone   && <p style={{ textAlign: 'center', margin: '0 0 8px', color: '#64748b', fontSize: 11 }}>📞 {invSettings.phone}</p>}
          <p style={{ textAlign: 'center', margin: '0 0 14px', color: '#64748b', fontSize: 13 }}>{billData.invoiceNo}</p>

          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 14 }}>
            {billData.customerName  && <div>👤 <strong>{billData.customerName}</strong></div>}
            {customerPhone          && <div style={{ marginTop: 4 }}>📱 {displayPhone(customerPhone)}</div>}
            {billData.vehicleNumber && <div style={{ marginTop: 4 }}>🚗 {billData.vehicleNumber}</div>}
            {billData.date          && <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>📅 {billData.date}</div>}
          </div>

          {billData.serviceItems?.filter((si) => si.name && nn(si.rate) > 0).map((si, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span>🔧 {si.name}</span>
              <span style={{ fontWeight: 700 }}>Rs.{fmt(nn(si.qty) * nn(si.rate))}</span>
            </div>
          ))}

          {billData.partsUsed?.filter((p) => p.name).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span>🔩 {p.name} ×{p.qty}</span>
              <span style={{ fontWeight: 700, color: '#16a34a' }}>Rs.{fmt(nn(p.qty) * nn(p.sellPrice) * (1 - nn(p.discount) / 100))}</span>
            </div>
          ))}

          {billData.remark && (
            <div style={{ padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginTop: 10, fontSize: 12 }}>
              📝 {billData.remark}
            </div>
          )}

          <div style={{ fontWeight: 900, fontSize: 30, textAlign: 'center', padding: 16, background: '#f0f9ff', color: '#0369a1', borderRadius: 12, marginBottom: 16, marginTop: 12 }}>
            Rs.{fmt(billData.grandTotal)}
          </div>

          {balance > 0 && (
            <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, marginBottom: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 700 }}>{t.balanceDue}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#dc2626' }}>Rs.{fmt(balance)}</div>
            </div>
          )}

          {totalDebt > 0 && (
            <div style={{ padding: 14, background: 'linear-gradient(135deg,#fff1f2,#fef2f2)', border: '2px solid #fecaca', borderRadius: 12, marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 800 }}>📌 {t.totalDebt}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#b91c1c', marginTop: 4 }}>Rs.{fmt(totalDebt)}</div>
              <div style={{ fontSize: 11, color: '#991b1b', marginTop: 6, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                {previousDebt > 0 && <span>{t.previousDebt}: Rs.{fmt(previousDebt)}</span>}
                {balance      > 0 && <span>{t.thisBalance}: Rs.{fmt(balance)}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {PAY_OPTIONS.map((po) => (
              <button key={po.key}
                onClick={() => setPayments([{ method: po.key, amount: po.key === 'credit' ? '0' : String(billData.grandTotal || '') }])}
                style={{ flex: 1, minWidth: 48, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 18, border: payments[0]?.method === po.key ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: payments[0]?.method === po.key ? '#eff6ff' : 'white' }}>
                {po.icon}
              </button>
            ))}
          </div>

          <input
            type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
            value={payments[0]?.amount || ''}
            disabled={payments[0]?.method === 'credit'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^\d*\.?\d{0,2}$/.test(val))
                setPayments([{ ...payments[0], amount: val }]);
            }}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val === '' || val === '.') { setPayments([{ ...payments[0], amount: '' }]); return; }
              const num = parseFloat(val);
              if (!isNaN(num)) setPayments([{ ...payments[0], amount: String(num) }]);
            }}
            onFocus={(e) => { setTimeout(() => { try { e.target.setSelectionRange(0, e.target.value.length); } catch {} }, 50); }}
            placeholder="0.00"
            style={{ width: '100%', padding: 14, borderRadius: 10, border: payments[0]?.method === 'credit' ? '1px solid #e2e8f0' : '2px solid #3b82f6', fontSize: 22, fontWeight: 900, textAlign: 'center', boxSizing: 'border-box', fontFamily: 'monospace', letterSpacing: 1, background: payments[0]?.method === 'credit' ? '#f8fafc' : 'white', color: payments[0]?.method === 'credit' ? '#94a3b8' : '#1e293b', outline: 'none' }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {done ? (
            <div style={{ flex: 2, textAlign: 'center', color: '#16a34a', fontWeight: 900, padding: 14, background: '#dcfce7', borderRadius: 10 }}>✅</div>
          ) : (
            <button onClick={handleSave} disabled={saving || (totalPaid <= 0 && !creditSelected)}
              style={{ flex: 2, padding: 14, borderRadius: 10, background: saving ? '#86efac' : '#16a34a', color: 'white', border: 'none', fontWeight: 900, cursor: 'pointer', fontSize: 14 }}>
              {saving ? '⏳' : `✅ ${t.savePayment}`}
            </button>
          )}
          <button onClick={onClose} style={{ padding: '14px 20px', borderRadius: 10, background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <ShareActions entry={entryForShare} invSettings={invSettings} lang={lang} phone={customerPhone} />

        {accountUrl && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <a href={accountUrl} target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, padding: '12px 14px', borderRadius: 10, textAlign: 'center', textDecoration: 'none', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, border: '2px solid #bfdbfe', fontSize: 13 }}>
              👤 {t.viewAccount}
            </a>
            <button onClick={handleCopyLink}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', background: accountLinkCopied ? '#dcfce7' : '#f8fafc', color: accountLinkCopied ? '#16a34a' : '#475569', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {accountLinkCopied ? t.accountLinkCopied : t.copyAccountLink}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

// components/production/ShareActions.jsx

import React from 'react';
import { buildReceiptText, buildReceiptHTML } from './receiptBuilders';
import { formatPhoneWA } from './utils';

export default function ShareActions({
  entry,
  invSettings,
  lang = 'si',
  phone = '',
  compact = false,
}) {
  const customerPhone = phone || entry?.customerPhone || '';

  const doWhatsApp = () => {
    const msg = buildReceiptText(entry, invSettings, lang);
    if (customerPhone) {
      window.open(
        `https://wa.me/${formatPhoneWA(customerPhone)}?text=${encodeURIComponent(msg)}`,
        '_blank'
      );
    } else {
      const input = prompt(
        lang === 'si' ? 'WhatsApp අංකය:' : 'WhatsApp number:', '07'
      );
      if (input)
        window.open(
          `https://wa.me/${formatPhoneWA(input.trim())}?text=${encodeURIComponent(msg)}`,
          '_blank'
        );
    }
  };

  const doSMS = () => {
    const msg = buildReceiptText(entry, invSettings, lang);
    if (customerPhone) {
      window.open(`sms:${customerPhone}?body=${encodeURIComponent(msg)}`, '_self');
    } else {
      const input = prompt(
        lang === 'si' ? 'SMS අංකය:' : 'SMS number:', '07'
      );
      if (input)
        window.open(`sms:${input.trim()}?body=${encodeURIComponent(msg)}`, '_self');
    }
  };

  const doPrint = () => {
    const html = buildReceiptHTML(entry, invSettings);
    const w = window.open('', '_blank', 'width=350,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  const doShare = () => {
    const text = buildReceiptText(entry, invSettings, lang);
    if (navigator.share) {
      navigator.share({ title: entry.batchNumber || 'Receipt', text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      alert('📋 Copied!');
    }
  };

  const btnStyle = (bg) => ({
    padding: compact ? '7px 10px' : '10px 14px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: compact ? 12 : 13,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  });

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button onClick={doPrint}    style={btnStyle('#2563eb')}>🖨️{!compact && ' Print'}</button>
      <button onClick={doWhatsApp} style={btnStyle('#25D366')}>💬{!compact && ' WA'}</button>
      <button onClick={doSMS}      style={btnStyle('#8b5cf6')}>📱{!compact && ' SMS'}</button>
      <button onClick={doShare}    style={btnStyle('#475569')}>📤{!compact && ' Share'}</button>
    </div>
  );
}
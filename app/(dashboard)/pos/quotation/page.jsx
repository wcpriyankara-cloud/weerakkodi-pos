'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';

const POSInvoice = dynamicImport(
  () => import('@/components/POSInvoice'),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        ⏳ Loading quotation...
      </div>
    ),
  }
);

export default function QuotationPage() {
  const [lang, setLang] = useState('si');

  useEffect(() => {
    const sync = () => {
      try { setLang(localStorage.getItem('language') || 'si'); }
      catch { setLang('si'); }
    };
    const onChange = (e) => setLang(e.detail || 'si');

    sync();
    window.addEventListener('app-language-change', onChange);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener('app-language-change', onChange);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return <POSInvoice mode="quotation" lang={lang} />;
}
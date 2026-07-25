'use client';

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';

const InvoiceList = dynamicImport(
  () => import('@/components/InvoiceList'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: '#64748b',
          fontSize: 16,
        }}
      >
        ⏳ ලෝඩ් වෙමින්...
      </div>
    ),
  }
);

export default function InvoiceListPage() {
  const [lang, setLang] = useState('si');

  useEffect(() => {
    const syncLanguage = () => {
      try {
        const saved = localStorage.getItem('language') || 'si';
        setLang(saved);
      } catch {
        setLang('si');
      }
    };

    const handleAppLangChange = (e) => {
      setLang(e.detail || 'si');
    };

    // initial load
    syncLanguage();

    // other tabs
    window.addEventListener('storage', syncLanguage);

    // same tab
    window.addEventListener('app-language-change', handleAppLangChange);

    return () => {
      window.removeEventListener('storage', syncLanguage);
      window.removeEventListener('app-language-change', handleAppLangChange);
    };
  }, []);

  return <InvoiceList lang={lang} />;
}
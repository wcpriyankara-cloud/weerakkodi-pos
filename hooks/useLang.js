'use client';

import { useState, useEffect } from 'react';

export function useLang() {
  const [lang, setLang]       = useState('si');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'si' || saved === 'en') setLang(saved);
    } catch {}

    const onLangChange = (e) => {
      if (e.detail === 'si' || e.detail === 'en') setLang(e.detail);
    };
    const onStorage = (e) => {
      if (e.key === 'language' &&
          (e.newValue === 'si' || e.newValue === 'en')) {
        setLang(e.newValue);
      }
    };

    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('app-language-change', onLangChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const changeLang = (newLang) => {
    if (newLang !== 'si' && newLang !== 'en') return;
    setLang(newLang);
    try {
      localStorage.setItem('language', newLang);
      window.dispatchEvent(
        new CustomEvent('app-language-change', { detail: newLang })
      );
    } catch {}
  };

  return {
    lang:    mounted ? lang : 'si',
    changeLang,
    mounted,
  };
}
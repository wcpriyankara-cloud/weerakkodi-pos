'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useUserAuth } from '@/context/UserContext';

/* ═══════════════════════════════════════
   TRANSLATIONS
   ═══════════════════════════════════════ */
const TEXT = {
  si: {
    appName: 'Weerakkodi POS App',
    loading: 'Loading...',
    loginTitle: 'Weerakkodi POS App',
    loginSub: 'පද්ධතිය භාවිත කිරීමට පළමුව login කරන්න',
    signInGoogle: 'Google සමඟ Login කරන්න',
    homeTitle: 'ප්‍රධාන පිටුව',
    welcome: 'සාදරයෙන් පිළිගනිමු!',
    emailVerified: 'සාර්ථකව Login වී ඇත',
    vehicleIncome: 'වාහන ආදායම්',
    vehicleIncomeDesc: 'වාහන ආදායම් කළමනාකරණය',
    vehicleExpenses: 'වාහන වියදම්',
    vehicleExpensesDesc: 'වාහන වියදම් කළමනාකරණය',
    pos: 'POS',
    posDesc: 'POS module',
    invoiceList: 'ඉන්වොයිස් ලැයිස්තුව',
    invoiceListDesc: 'ඉන්වොයිස් ලැයිස්තුව',
    approvedOrders: 'අනුමත ඇණවුම්',
    approvedOrdersDesc: 'අනුමත ඇණවුම්',
    catalog: 'Catalog',
    catalogDesc: 'Product catalog',
    customers: 'Customers',
    customersDesc: 'පාරිභෝගික කළමනාකරණය',
    suppliers: 'Suppliers',
    suppliersDesc: 'සැපයුම්කරු කළමනාකරණය',
    logout: 'Logout',
  },
  en: {
    appName: 'Weerakkodi POS App',
    loading: 'Loading...',
    loginTitle: 'Weerakkodi POS App',
    loginSub: 'Please login first to use the system',
    signInGoogle: 'Login with Google',
    homeTitle: 'Home Page',
    welcome: 'Welcome!',
    emailVerified: 'Logged in successfully',
    vehicleIncome: 'Vehicle Income',
    vehicleIncomeDesc: 'Vehicle income management',
    vehicleExpenses: 'Vehicle Expenses',
    vehicleExpensesDesc: 'Vehicle expense management',
    pos: 'POS',
    posDesc: 'POS module',
    invoiceList: 'Invoice List',
    invoiceListDesc: 'Invoice list',
    approvedOrders: 'Approved Orders',
    approvedOrdersDesc: 'Approved orders',
    catalog: 'Catalog',
    catalogDesc: 'Product catalog',
    customers: 'Customers',
    customersDesc: 'Customer management',
    suppliers: 'Suppliers',
    suppliersDesc: 'Supplier management',
    logout: 'Logout',
  },
};

function getCards(t) {
  return [
    {
      href: '/vehicle-income',
      icon: '🚛',
      title: t.vehicleIncome,
      desc: t.vehicleIncomeDesc,
    },
    {
      href: '/vehicle-expenses',
      icon: '💸',
      title: t.vehicleExpenses,
      desc: t.vehicleExpensesDesc,
    },
    {
      href: '/pos',
      icon: '🧾',
      title: t.pos,
      desc: t.posDesc,
    },
    {
      href: '/invoice-list',
      icon: '📋',
      title: t.invoiceList,
      desc: t.invoiceListDesc,
    },
    {
      href: '/approved',
      icon: '✅',
      title: t.approvedOrders,
      desc: t.approvedOrdersDesc,
    },
    {
      href: '/pfi/demo-shop',
      icon: '🛍️',
      title: t.catalog,
      desc: t.catalogDesc,
    },
    {
      href: '/customers',
      icon: '👥',
      title: t.customers,
      desc: t.customersDesc,
    },
    {
      href: '/suppliers',
      icon: '🏭',
      title: t.suppliers,
      desc: t.suppliersDesc,
    },
  ];
}

function Card({ href, icon, title, desc }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: 'none',
        background: 'white',
        color: '#0f172a',
        borderRadius: 18,
        padding: 20,
        fontWeight: 700,
        display: 'block',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
        {desc}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user, loading, logOut, signInWithGoogle } = useUserAuth();

  const [lang, setLang] = useState('si');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    try {
      const saved = localStorage.getItem('language');
      if (saved === 'si' || saved === 'en') setLang(saved);
    } catch {}

    const onLangChange = (e) => {
      const newLang = e.detail || 'si';
      if (newLang === 'si' || newLang === 'en') setLang(newLang);
    };

    const onStorage = () => {
      try {
        const saved = localStorage.getItem('language');
        if (saved === 'si' || saved === 'en') setLang(saved);
      } catch {}
    };

    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('app-language-change', onLangChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const safeLang = mounted ? lang : 'si';
  const t = useMemo(() => TEXT[safeLang] || TEXT.si, [safeLang]);
  const cards = useMemo(() => getCards(t), [t]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 14,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            border: '4px solid rgba(255,255,255,0.25)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontWeight: 700, color: '#cbd5e1' }}>{t.loading}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24,
            padding: 32,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏪</div>

          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>
            {t.loginTitle}
          </h1>

          <p style={{ marginTop: 10, color: '#cbd5e1', fontSize: 16 }}>
            {t.loginSub}
          </p>

          <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
            <button
              onClick={signInWithGoogle}
              style={{
                width: '100%',
                padding: '14px 18px',
                borderRadius: 14,
                border: 'none',
                background: 'white',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              🔐 {t.signInGoogle}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
        color: 'white',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24,
            padding: 28,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.20)',
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏪</div>

          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>
            {t.appName}
          </h1>

          <p style={{ marginTop: 10, color: '#cbd5e1', fontSize: 16 }}>
            {t.homeTitle}
          </p>

          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.08)',
              padding: '10px 16px',
              borderRadius: 14,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 14 }}>✅</span>
            <span
              style={{
                fontSize: 14,
                color: '#e2e8f0',
                fontWeight: 600,
              }}
            >
              {user.email}
            </span>
            <button
              onClick={logOut}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {t.logout}
            </button>
          </div>
        </div>

        {/* Quick Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {cards.map((card) => (
            <Card key={card.href} {...card} />
          ))}
        </div>
      </div>
    </div>
  );
}
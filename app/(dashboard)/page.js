'use client';

// app/(dashboard)/page.js
// Dashboard Home Page — All Quick Access Buttons (Updated)

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

/* ═══════════════════════════════════════
   TRANSLATIONS
   ═══════════════════════════════════════ */
const T = {
  si: {
    welcome:              'සාදරයෙන් පිළිගනිමු!',
    subtitle:             'ඔබේ ව්‍යාපාරය කළමනාකරණය කරන්න',
    quickAccess:          'ඉක්මන් ප්‍රවේශය',
    pos:                  'POS',
    posDesc:              'අලුත් බිල්පතක්',
    invoices:             'ඉන්වොයිස්',
    invoicesDesc:         'බිල්පත් ලැයිස්තුව',
    customers:            'පාරිභෝගිකයින්',
    customersDesc:        'ගනුදෙනුකරුවන්',
    suppliers:            'සැපයුම්කරුවන්',
    suppliersDesc:        'සැපයුම්කරු කළමනාකරණය',
    purchases:            'ගැනුම්',
    purchasesDesc:        'ගැනුම් ඉන්වොයිස් කළමනාකරණය',
    purchaseReturn:       'ගැනුම් ආපසු',
    purchaseReturnDesc:   'ගැනුම් ආපසු භාරදීම්',
    purchaseOrders:       'ගැනුම් ඇණවුම්',
    purchaseOrdersDesc:   'ගැනුම් ඇණවුම් කළමනාකරණය',
    vehicleIncome:        'වාහන ආදායම්',
    vehicleIncomeDesc:    'වාහන ගමන් කළමනාකරණය',
    vehicleExpenses:      'වාහන වියදම්',
    vehicleExpensesDesc:  'වාහන වියදම් කළමනාකරණය',
    orders:               'ඇණවුම්',
    ordersDesc:           'පාරිභෝගික ඇණවුම්',
    returns:              'ආපසු භාර',
    returnsDesc:          'ආපසු භාර ගැනීම්',
    shops:                'වෙළඳසැල්',
    shopsDesc:            'වෙළඳසැල් කළමනාකරණය',
  },
  en: {
    welcome:              'Welcome!',
    subtitle:             'Manage your business',
    quickAccess:          'Quick Access',
    pos:                  'POS',
    posDesc:              'New invoice',
    invoices:             'Invoices',
    invoicesDesc:         'Invoice list',
    customers:            'Customers',
    customersDesc:        'Customer management',
    suppliers:            'Suppliers',
    suppliersDesc:        'Supplier management',
    purchases:            'Purchases',
    purchasesDesc:        'Purchase invoice management',
    purchaseReturn:       'Purchase Returns',
    purchaseReturnDesc:   'Purchase return management',
    purchaseOrders:       'Purchase Orders',
    purchaseOrdersDesc:   'Purchase order management',
    vehicleIncome:        'Vehicle Income',
    vehicleIncomeDesc:    'Vehicle trip management',
    vehicleExpenses:      'Vehicle Expenses',
    vehicleExpensesDesc:  'Vehicle expense management',
    orders:               'Orders',
    ordersDesc:           'Customer orders',
    returns:              'Returns',
    returnsDesc:          'Return management',
    shops:                'Shops',
    shopsDesc:            'Shop management',
  },
};

/* ═══════════════════════════════════════
   QUICK ACCESS CARDS
   ═══════════════════════════════════════ */
function getQuickCards(t) {
  return [
    {
      id: 'pos',
      title: t.pos,
      desc: t.posDesc,
      icon: '🖥️',
      path: '/pos',
      gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    },
    {
      id: 'invoices',
      title: t.invoices,
      desc: t.invoicesDesc,
      icon: '🧾',
      path: '/invoice-list',
      gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    },
    {
      id: 'purchases',
      title: t.purchases,
      desc: t.purchasesDesc,
      icon: '📦',
      path: '/purchases',
      gradient: 'linear-gradient(135deg, #f97316, #ea580c)',
    },
    {
      id: 'purchase-return',
      title: t.purchaseReturn,
      desc: t.purchaseReturnDesc,
      icon: '↩️',
      path: '/purchase-return',
      gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
    },
    {
      id: 'purchase-orders',
      title: t.purchaseOrders,
      desc: t.purchaseOrdersDesc,
      icon: '📋',
      path: '/purchase-orders',
      gradient: 'linear-gradient(135deg, #a855f7, #9333ea)',
    },
    {
      id: 'customers',
      title: t.customers,
      desc: t.customersDesc,
      icon: '👥',
      path: '/customers',
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
    },
    {
      id: 'suppliers',
      title: t.suppliers,
      desc: t.suppliersDesc,
      icon: '🏭',
      path: '/suppliers',
      gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    },
    {
      id: 'vehicle-income',
      title: t.vehicleIncome,
      desc: t.vehicleIncomeDesc,
      icon: '🚛',
      path: '/vehicle-income',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    },
    {
      id: 'vehicle-expenses',
      title: t.vehicleExpenses,
      desc: t.vehicleExpensesDesc,
      icon: '💸',
      path: '/vehicle-expenses',
      gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    },
    {
      id: 'orders',
      title: t.orders,
      desc: t.ordersDesc,
      icon: '📦',
      path: '/customer-orders',
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    },
    {
      id: 'returns',
      title: t.returns,
      desc: t.returnsDesc,
      icon: '🔄',
      path: '/return',
      gradient: 'linear-gradient(135deg, #f43f5e, #e11d48)',
    },
    {
      id: 'shops',
      title: t.shops,
      desc: t.shopsDesc,
      icon: '🏪',
      path: '/shops',
      gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    },
  ];
}

/* ═══════════════════════════════════════
   DASHBOARD CARD COMPONENT
   ═══════════════════════════════════════ */
function DashboardCard({ card }) {
  return (
    <Link
      href={card.path}
      style={{
        textDecoration: 'none',
        background: card.gradient,
        border: 'none',
        borderRadius: 16,
        padding: '24px 20px',
        color: 'white',
        textAlign: 'left',
        transition: 'transform 0.2s, box-shadow 0.2s',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
      }}
    >
      {/* Icon box */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          flexShrink: 0,
        }}
      >
        {card.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            marginBottom: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {card.title}
        </div>
        <div
          style={{
            fontSize: 13,
            opacity: 0.85,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {card.desc}
        </div>
      </div>

      {/* Arrow */}
      <div style={{ fontSize: 18, opacity: 0.6, flexShrink: 0 }}>→</div>
    </Link>
  );
}

/* ═══════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════ */
export default function DashboardPage() {
  // Language state
  const [lang, setLang] = useState('si');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Load from localStorage
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'en' || saved === 'si') setLang(saved);
    } catch {}

    // Listen for sidebar language change (custom event)
    const handleLangEvent = (e) => {
      const value = e.detail;
      if (value === 'en' || value === 'si') setLang(value);
    };

    // Listen for cross-tab storage changes
    const handleStorage = (e) => {
      if (e.key !== 'language') return;
      if (e.newValue === 'en' || e.newValue === 'si') {
        setLang(e.newValue);
      }
    };

    window.addEventListener('app-language-change', handleLangEvent);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('app-language-change', handleLangEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, []); // ✅ Empty deps — no polling, no re-subscribe

  const safeLang = mounted ? lang : 'si';
  const t = useMemo(() => T[safeLang] || T.si, [safeLang]);
  const cards = useMemo(() => getQuickCards(t), [t]);

  /* ─── RENDER ─── */
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 4px' }}>
      {/* Welcome Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: 20,
          padding: '30px 28px',
          marginBottom: 28,
          color: 'white',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 10 }}>🏪</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
          {t.welcome}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 15, opacity: 0.9 }}>
          {t.subtitle}
        </p>
      </div>

      {/* Quick Access Title */}
      <h2
        style={{
          margin: '0 0 18px',
          fontSize: 20,
          fontWeight: 800,
          color: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 24 }}>⚡</span>
        {t.quickAccess}
      </h2>

      {/* Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 30,
        }}
      >
        {cards.map((card) => (
          <DashboardCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
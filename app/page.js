'use client';

// app/page.js
// Root Page — Auth Gate + Login + Dashboard Cards

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useUserAuth } from '@/context/UserContext';

/* ═══════════════════════════════════════
   TRANSLATIONS
   ═══════════════════════════════════════ */
const TEXT = {
  si: {
    appName:            'Weerakkodi POS App',
    loading:            'Loading...',
    loginTitle:         'Weerakkodi POS App',
    loginSub:           'පද්ධතිය භාවිත කිරීමට පළමුව login කරන්න',
    signInGoogle:       'Google සමඟ Login කරන්න',
    homeTitle:          'ප්‍රධාන පිටුව',
    welcome:            'සාදරයෙන් පිළිගනිමු!',
    quickAccess:        'ඉක්මන් ප්‍රවේශය',
    vehicleIncome:      'වාහන ආදායම්',
    vehicleIncomeDesc:  'වාහන ආදායම් කළමනාකරණය',
    vehicleExpenses:    'වාහන වියදම්',
    vehicleExpensesDesc:'වාහන වියදම් කළමනාකරණය',
    pos:                'POS',
    posDesc:            'POS module',
    invoiceList:        'ඉන්වොයිස් ලැයිස්තුව',
    invoiceListDesc:    'ඉන්වොයිස් ලැයිස්තුව',
    approvedOrders:     'අනුමත ඇණවුම්',
    approvedOrdersDesc: 'අනුමත ඇණවුම්',
    catalog:            'Catalog',
    catalogDesc:        'Product catalog',
    customers:          'Customers',
    customersDesc:      'පාරිභෝගික කළමනාකරණය',
    suppliers:          'Suppliers',
    suppliersDesc:      'සැපයුම්කරු කළමනාකරණය',
    purchases:          'ගැනුම්',
    purchasesDesc:      'ගැනුම් ඉන්වොයිස් කළමනාකරණය',
    purchaseReturn:     'ගැනුම් ආපසු',
    purchaseReturnDesc: 'ගැනුම් ආපසු භාරදීම්',
    purchaseOrders:     'ගැනුම් ඇණවුම්',
    purchaseOrdersDesc: 'ගැනුම් ඇණවුම් කළමනාකරණය',
    orders:             'ඇණවුම්',
    ordersDesc:         'පාරිභෝගික ඇණවුම්',
    returns:            'ආපසු භාර',
    returnsDesc:        'ආපසු භාර ගැනීම්',
    shops:              'වෙළඳසැල්',
    shopsDesc:          'වෙළඳසැල් කළමනාකරණය',
    logout:             'Logout',
    signingIn:          'Login වෙමින්...',
  },
  en: {
    appName:            'Weerakkodi POS App',
    loading:            'Loading...',
    loginTitle:         'Weerakkodi POS App',
    loginSub:           'Please login first to use the system',
    signInGoogle:       'Login with Google',
    homeTitle:          'Home Page',
    welcome:            'Welcome!',
    quickAccess:        'Quick Access',
    vehicleIncome:      'Vehicle Income',
    vehicleIncomeDesc:  'Vehicle income management',
    vehicleExpenses:    'Vehicle Expenses',
    vehicleExpensesDesc:'Vehicle expense management',
    pos:                'POS',
    posDesc:            'POS module',
    invoiceList:        'Invoice List',
    invoiceListDesc:    'Invoice list',
    approvedOrders:     'Approved Orders',
    approvedOrdersDesc: 'Approved orders',
    catalog:            'Catalog',
    catalogDesc:        'Product catalog',
    customers:          'Customers',
    customersDesc:      'Customer management',
    suppliers:          'Suppliers',
    suppliersDesc:      'Supplier management',
    purchases:          'Purchases',
    purchasesDesc:      'Purchase invoice management',
    purchaseReturn:     'Purchase Returns',
    purchaseReturnDesc: 'Purchase return management',
    purchaseOrders:     'Purchase Orders',
    purchaseOrdersDesc: 'Purchase order management',
    orders:             'Orders',
    ordersDesc:         'Customer orders',
    returns:            'Returns',
    returnsDesc:        'Return management',
    shops:              'Shops',
    shopsDesc:          'Shop management',
    logout:             'Logout',
    signingIn:          'Signing in...',
  },
};

/* ═══════════════════════════════════════
   CARDS CONFIG
   ═══════════════════════════════════════ */
function getCards(t) {
  return [
    {
      href:     '/pos',
      icon:     '🖥️',
      title:    t.pos,
      desc:     t.posDesc,
      gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    },
    {
      href:     '/invoice-list',
      icon:     '🧾',
      title:    t.invoiceList,
      desc:     t.invoiceListDesc,
      gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    },
    {
      href:     '/purchases',
      icon:     '📦',
      title:    t.purchases,
      desc:     t.purchasesDesc,
      gradient: 'linear-gradient(135deg, #f97316, #ea580c)',
    },
    {
      href:     '/purchase-return',
      icon:     '↩️',
      title:    t.purchaseReturn,
      desc:     t.purchaseReturnDesc,
      gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
    },
    {
      href:     '/purchase-orders',
      icon:     '📋',
      title:    t.purchaseOrders,
      desc:     t.purchaseOrdersDesc,
      gradient: 'linear-gradient(135deg, #a855f7, #9333ea)',
    },
    {
      href:     '/customers',
      icon:     '👥',
      title:    t.customers,
      desc:     t.customersDesc,
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
    },
    {
      href:     '/suppliers',
      icon:     '🏭',
      title:    t.suppliers,
      desc:     t.suppliersDesc,
      gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    },
    {
      href:     '/vehicle-income',
      icon:     '🚛',
      title:    t.vehicleIncome,
      desc:     t.vehicleIncomeDesc,
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    },
    {
      href:     '/vehicle-expenses',
      icon:     '💸',
      title:    t.vehicleExpenses,
      desc:     t.vehicleExpensesDesc,
      gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    },
    {
      href:     '/approved',
      icon:     '✅',
      title:    t.approvedOrders,
      desc:     t.approvedOrdersDesc,
      gradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
    },
    {
      href:     '/customer-orders',
      icon:     '🛒',
      title:    t.orders,
      desc:     t.ordersDesc,
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    },
    {
      href:     '/return',
      icon:     '🔄',
      title:    t.returns,
      desc:     t.returnsDesc,
      gradient: 'linear-gradient(135deg, #f43f5e, #e11d48)',
    },
    {
      href:     '/pfi/demo-shop',
      icon:     '🛍️',
      title:    t.catalog,
      desc:     t.catalogDesc,
      gradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    },
    {
      href:     '/shops',
      icon:     '🏪',
      title:    t.shops,
      desc:     t.shopsDesc,
      gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    },
  ];
}

/* ═══════════════════════════════════════
   CARD COMPONENT
   ═══════════════════════════════════════ */
function Card({ href, icon, title, desc, gradient }) {
  return (
    <Link
      href={href}
      aria-label={title}
      style={{
        textDecoration: 'none',
        background: gradient || 'rgba(255,255,255,0.1)',
        color: 'white',
        borderRadius: 18,
        padding: '20px 18px',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.25)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 13,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            marginBottom: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            opacity: 0.85,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {desc}
        </div>
      </div>

      {/* Arrow */}
      <div style={{ fontSize: 16, opacity: 0.6, flexShrink: 0 }}>→</div>
    </Link>
  );
}

/* ═══════════════════════════════════════
   SPINNER
   ═══════════════════════════════════════ */
function Spinner() {
  return (
    <>
      <style>{`
        @keyframes pcf-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          width: 42,
          height: 42,
          border: '4px solid rgba(255,255,255,0.25)',
          borderTopColor: '#ffffff',
          borderRadius: '50%',
          animation: 'pcf-spin 1s linear infinite',
        }}
      />
    </>
  );
}

/* ═══════════════════════════════════════
   PAGE WRAPPER (shared bg)
   ═══════════════════════════════════════ */
function PageBg({ children, center = false }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
        color: 'white',
        fontFamily: '-apple-system, Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: center ? 'center' : 'stretch',
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════
   LOADING SCREEN
   ═══════════════════════════════════════ */
function LoadingScreen({ label }) {
  return (
    <PageBg center>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Spinner />
        <div style={{ fontWeight: 700, color: '#cbd5e1', fontSize: 15 }}>
          {label}
        </div>
      </div>
    </PageBg>
  );
}

/* ═══════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════ */
function LoginScreen({ t, onGoogleLogin, signingIn }) {
  return (
    <PageBg center>
      <div style={{ width: '100%', maxWidth: 520, padding: '0 20px' }}>
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24,
            padding: '40px 32px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center',
          }}
        >
          {/* Logo */}
          <div style={{ fontSize: 68, marginBottom: 16 }}>🏪</div>

          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: '-0.5px',
            }}
          >
            {t.loginTitle}
          </h1>

          <p
            style={{
              marginTop: 12,
              color: '#cbd5e1',
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            {t.loginSub}
          </p>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: 'rgba(255,255,255,0.1)',
              margin: '24px 0',
            }}
          />

          {/* Google login button */}
          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={signingIn}
            style={{
              width: '100%',
              padding: '15px 18px',
              borderRadius: 14,
              border: 'none',
              background: signingIn
                ? '#94a3b8'
                : 'white',
              color: '#0f172a',
              fontWeight: 800,
              fontSize: 16,
              cursor: signingIn ? 'not-allowed' : 'pointer',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'background 0.2s, transform 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!signingIn)
                e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {signingIn ? (
              <>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: '3px solid rgba(0,0,0,0.2)',
                    borderTopColor: '#0f172a',
                    borderRadius: '50%',
                    animation: 'pcf-spin 1s linear infinite',
                  }}
                />
                {t.signingIn}
              </>
            ) : (
              <>
                <span style={{ fontSize: 20 }}>🔐</span>
                {t.signInGoogle}
              </>
            )}
          </button>

          {/* Spinner keyframes shared */}
          <style>{`
            @keyframes pcf-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    </PageBg>
  );
}

/* ═══════════════════════════════════════
   HOME PAGE (authenticated)
   ═══════════════════════════════════════ */
export default function HomePage() {
  const { user, loading, logOut, signInWithGoogle } = useUserAuth();

  const [lang, setLang]         = useState('si');
  const [mounted, setMounted]   = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  // ─── Language sync ───
  useEffect(() => {
    setMounted(true);

    try {
      const saved = localStorage.getItem('language');
      if (saved === 'si' || saved === 'en') setLang(saved);
    } catch {}

    const onLangChange = (e) => {
      const v = e.detail;
      if (v === 'si' || v === 'en') setLang(v);
    };

    // ✅ Use e.key + e.newValue — efficient, no localStorage re-read
    const onStorage = (e) => {
      if (e.key !== 'language') return;
      if (e.newValue === 'si' || e.newValue === 'en') setLang(e.newValue);
    };

    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('app-language-change', onLangChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []); // ✅ Empty deps — run once only

  const safeLang = mounted ? lang : 'si';
  const t        = useMemo(() => TEXT[safeLang] || TEXT.si, [safeLang]);
  const cards    = useMemo(() => getCards(t), [t]);

  // ─── Google login with loading state ───
  const handleGoogleLogin = useCallback(async () => {
    if (signingIn) return;
    try {
      setSigningIn(true);
      await signInWithGoogle();
    } catch (e) {
      console.error('Login error:', e);
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, signInWithGoogle]);

  // ─── Loading state ───
  if (loading) {
    return <LoadingScreen label={t.loading} />;
  }

  // ─── Not logged in ───
  if (!user) {
    return (
      <LoginScreen
        t={t}
        onGoogleLogin={handleGoogleLogin}
        signingIn={signingIn}
      />
    );
  }

  // ─── Authenticated dashboard ───
  return (
    <PageBg>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, width: '100%' }}>

        {/* ── Header ── */}
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24,
            padding: '28px 24px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.20)',
            marginBottom: 28,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 60, marginBottom: 12 }}>🏪</div>

          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>
            {t.appName}
          </h1>

          <p style={{ marginTop: 8, color: '#cbd5e1', fontSize: 15 }}>
            {t.homeTitle}
          </p>

          {/* User info + logout */}
          <div
            style={{
              marginTop: 16,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.08)',
              padding: '10px 16px',
              borderRadius: 14,
              flexWrap: 'wrap',
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* Avatar */}
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid rgba(255,255,255,0.3)',
                }}
              />
            ) : (
              <span style={{ fontSize: 16 }}>✅</span>
            )}

            {/* Name / email */}
            <div style={{ textAlign: 'left' }}>
              {user.displayName && (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#f1f5f9',
                  }}
                >
                  {user.displayName}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {user.email}
              </div>
            </div>

            {/* Logout button */}
            <button
              type="button"
              onClick={logOut}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = '#b91c1c')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = '#dc2626')
              }
            >
              {t.logout}
            </button>
          </div>
        </div>

        {/* ── Quick Access Title ── */}
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: 18,
            fontWeight: 800,
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 22 }}>⚡</span>
          {t.quickAccess}
        </h2>

        {/* ── Cards Grid ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
            paddingBottom: 30,
          }}
        >
          {cards.map((card) => (
            <Card key={card.href} {...card} />
          ))}
        </div>
      </div>
    </PageBg>
  );
}
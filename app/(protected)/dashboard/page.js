'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useUserAuth } from '@/context/UserContext';
import { useLang } from '@/hooks/useLang';

const T = {
  si: {
    appName:      'Weerakkodi POS',
    quickAccess:  'ඉක්මන් ප්‍රවේශය',
    logout:       'Logout',
    pos:          'POS',
    posDesc:      'නව බිල්පතක්',
    invoices:     'ඉන්වොයිස්',
    invoicesDesc: 'බිල්පත් ලැයිස්තුව',
    customers:    'පාරිභෝගිකයින්',
    customersDesc:'ගනුදෙනුකරුවන්',
    suppliers:    'සැපයුම්කරුවන්',
    suppliersDesc:'සැපයුම්කරු කළමනාකරණය',
    purchases:    'ගැනුම්',
    purchasesDesc:'ගැනුම් ඉන්වොයිස්',
    items:        'භාණ්ඩ',
    itemsDesc:    'භාණ්ඩ ලියාපදිංචිය',
    orders:       'ඇණවුම්',
    ordersDesc:   'පාරිභෝගික ඇණවුම්',
    returns:      'ආපසු භාර',
    returnsDesc:  'ආපසු භාර ගැනීම්',
    shops:        'වෙළඳසැල්',
    shopsDesc:    'වෙළඳසැල් කළමනාකරණය',
  },
  en: {
    appName:      'Weerakkodi POS',
    quickAccess:  'Quick Access',
    logout:       'Logout',
    pos:          'POS',
    posDesc:      'New invoice',
    invoices:     'Invoices',
    invoicesDesc: 'Invoice list',
    customers:    'Customers',
    customersDesc:'Customer management',
    suppliers:    'Suppliers',
    suppliersDesc:'Supplier management',
    purchases:    'Purchases',
    purchasesDesc:'Purchase invoices',
    items:        'Items',
    itemsDesc:    'Item registration',
    orders:       'Orders',
    ordersDesc:   'Customer orders',
    returns:      'Returns',
    returnsDesc:  'Return management',
    shops:        'Shops',
    shopsDesc:    'Shop management',
  },
};

const getCards = (t) => [
  { id: 'pos',            href: '/pos',            icon: '🖥️', title: t.pos,       desc: t.posDesc,       gradient: 'linear-gradient(135deg,#3b82f6,#2563eb)' },
  { id: 'invoices',       href: '/invoice-list',   icon: '🧾', title: t.invoices,  desc: t.invoicesDesc,  gradient: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
  { id: 'items',          href: '/items',           icon: '📦', title: t.items,     desc: t.itemsDesc,     gradient: 'linear-gradient(135deg,#f97316,#ea580c)' },
  { id: 'purchases',      href: '/purchases',       icon: '🛒', title: t.purchases, desc: t.purchasesDesc, gradient: 'linear-gradient(135deg,#ec4899,#db2777)' },
  { id: 'customers',      href: '/customers',       icon: '👥', title: t.customers, desc: t.customersDesc, gradient: 'linear-gradient(135deg,#10b981,#059669)' },
  { id: 'suppliers',      href: '/suppliers',       icon: '🏭', title: t.suppliers, desc: t.suppliersDesc, gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)' },
  { id: 'orders',         href: '/customer-orders', icon: '🛍️', title: t.orders,    desc: t.ordersDesc,    gradient: 'linear-gradient(135deg,#06b6d4,#0891b2)' },
  { id: 'returns',        href: '/return',          icon: '🔄', title: t.returns,   desc: t.returnsDesc,   gradient: 'linear-gradient(135deg,#f43f5e,#e11d48)' },
  { id: 'shops',          href: '/shops',           icon: '🏪', title: t.shops,     desc: t.shopsDesc,     gradient: 'linear-gradient(135deg,#14b8a6,#0d9488)' },
];

function DashboardCard({ card }) {
  return (
    <Link
      href={card.href}
      style={{
        textDecoration: 'none',
        background: card.gradient,
        borderRadius: 16,
        padding: '20px 16px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        border: '1px solid rgba(255,255,255,0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
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
      <div style={{
        width: 48, height: 48,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        flexShrink: 0,
      }}>
        {card.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 16,
          fontWeight: 800,
          marginBottom: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {card.title}
        </div>
        <div style={{
          fontSize: 12,
          opacity: 0.85,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {card.desc}
        </div>
      </div>
      <div style={{ fontSize: 16, opacity: 0.5, flexShrink: 0 }}>→</div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, logOut } = useUserAuth();
  const { lang, changeLang } = useLang();
  const t = T[lang] || T.si;
  const cards = useMemo(() => getCards(t), [t]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: '-apple-system, Arial, sans-serif',
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '24px 16px',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,#667eea,#764ba2)',
          borderRadius: 20,
          padding: '24px 20px',
          marginBottom: 24,
          color: 'white',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  style={{
                    width: 40, height: 40,
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.4)',
                  }}
                />
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  🏪 {t.appName}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {user?.email}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {/* Language toggle */}
              <button
                onClick={() => changeLang(lang === 'si' ? 'en' : 'si')}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  borderRadius: 8,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {lang === 'si' ? 'EN' : 'සිං'}
              </button>
              <button
                onClick={logOut}
                style={{
                  background: '#dc2626',
                  border: 'none',
                  color: 'white',
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {t.logout}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Access */}
        <h2 style={{
          margin: '0 0 16px',
          fontSize: 18,
          fontWeight: 800,
          color: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          ⚡ {t.quickAccess}
        </h2>

        {/* Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
          paddingBottom: 30,
        }}>
          {cards.map((card) => (
            <DashboardCard key={card.id} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}
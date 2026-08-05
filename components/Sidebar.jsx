'use client';

// components/Sidebar.jsx

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { BUSINESS_TYPES } from './production/constants';

const TEXT = {
  si: {
    appName:         'Weerakkodi POS',
    dashboard:       'Dashboard',
    sales:           'විකුණුම්',
    operations:      'මෙහෙයුම්',
    management:      'කළමනාකරණය',
    production:      'නිෂ්පාදනය',
    pos:             'POS',
    invoices:        'ඉන්වොයිස්',
    catalog:         'Catalog',
    items:           'භාණ්ඩ',
    stockAdjustment: 'Adjustment',
    purchases:       'ගැනුම්',
    customers:       'පාරිභෝගිකයින්',
    suppliers:       'සැපයුම්කරුවන්',
    vehicleIncome:   'වාහන ආදායම්',
    vehicleExpenses: 'වාහන වියදම්',
    orders:          'ඇණවුම්',
    returns:         'ආපසු භාර',
    shops:           'වෙළඳසැල්',
    approved:        'අනුමත',
    language:        'භාෂාව',
    logout:          'Logout',
    collapse:        'හකුළන්න',
    expand:          'විහිදුවන්න',
    english:         'English',
    sinhala:         'සිංහල',
    allProduction:   'සියලු නිෂ්පාදන',
  },
  en: {
    appName:         'Weerakkodi POS',
    dashboard:       'Dashboard',
    sales:           'Sales',
    operations:      'Operations',
    management:      'Management',
    production:      'Production',
    pos:             'POS',
    invoices:        'Invoices',
    catalog:         'Catalog',
    items:           'Items',
    stockAdjustment: 'Adjustment',
    purchases:       'Purchases',
    customers:       'Customers',
    suppliers:       'Suppliers',
    vehicleIncome:   'Vehicle Income',
    vehicleExpenses: 'Vehicle Expenses',
    orders:          'Orders',
    returns:         'Returns',
    shops:           'Shops',
    approved:        'Approved',
    language:        'Language',
    logout:          'Logout',
    collapse:        'Collapse',
    expand:          'Expand',
    english:         'English',
    sinhala:         'Sinhala',
    allProduction:   'All Production',
  },
};

function getMenu(t) {
  return [
    {
      section: t.dashboard,
      items: [
        { href: '/dashboard', label: t.dashboard, icon: '🏠' },
      ],
    },
    {
      section: t.sales,
      items: [
        { href: '/pos',             label: t.pos,      icon: '🖥️' },
        { href: '/invoice-list',    label: t.invoices, icon: '🧾' },
        { href: '/pfi',             label: t.catalog,  icon: '🛍️' },
        { href: '/customer-orders', label: t.orders,   icon: '🛒' },
        { href: '/return',          label: t.returns,  icon: '🔄' },
        { href: '/approved',        label: t.approved, icon: '✅' },
      ],
    },
    {
      section: t.operations,
      items: [
        { href: '/items',            label: t.items,           icon: '📦' },
        { href: '/stock-adjustment', label: t.stockAdjustment, icon: '🗃️' },
        { href: '/purchases',        label: t.purchases,       icon: '📥' },
        { href: '/vehicle-income',   label: t.vehicleIncome,   icon: '🚛' },
        { href: '/vehicle-expenses', label: t.vehicleExpenses, icon: '💸' },
        {
          href: '/production',
          label: t.production,
          icon: '🏭',
          badge: 'NEW',
          hasSubmenu: true,
        },
      ],
    },
    {
      section: t.management,
      items: [
        { href: '/customers', label: t.customers, icon: '👥' },
        { href: '/suppliers', label: t.suppliers, icon: '🏭' },
        { href: '/shops',     label: t.shops,     icon: '🏪' },
      ],
    },
  ];
}

function isActivePath(pathname, href) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ═══════════════════════════════════════
   ★ PRODUCTION SUBMENU ITEM
   ═══════════════════════════════════════ */
function ProductionSubmenu({ item, active, collapsed, onClick, lang }) {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  // Auto-expand when on production page
  useEffect(() => {
    if (pathname?.startsWith('/production')) {
      setExpanded(true);
    }
  }, [pathname]);

  const bizTypes = Object.values(BUSINESS_TYPES);

  const handleBizSelect = (bizId) => {
    // Save to localStorage so ProductionEntry picks it up
    try {
      localStorage.setItem('prod_bizType', bizId);
      window.dispatchEvent(new CustomEvent('production-biz-change', { detail: bizId }));
    } catch {}
    onClick?.();
  };

  const currentBiz = (() => {
    try { return localStorage.getItem('prod_bizType') || ''; } catch { return ''; }
  })();

  // Collapsed mode — just show link
  if (collapsed) {
    return (
      <Link
        href={item.href}
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 10px',
          borderRadius: 12,
          textDecoration: 'none',
          color: active ? '#ffffff' : '#cbd5e1',
          background: active ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'transparent',
          fontWeight: active ? 800 : 600,
          boxShadow: active ? '0 8px 20px rgba(37,99,235,0.25)' : 'none',
          position: 'relative',
        }}
        title={item.label}
      >
        <span style={{ fontSize: 18 }}>{item.icon}</span>
        {item.badge && (
          <span style={{
            position: 'absolute', top: 6, right: 6, width: 8, height: 8,
            borderRadius: '50%', background: '#16a34a', border: '2px solid #0f172a',
          }} />
        )}
      </Link>
    );
  }

  return (
    <div>
      {/* Main Production Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Link
          href={item.href}
          onClick={onClick}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            padding: '12px 14px',
            borderRadius: expanded ? '12px 12px 0 0' : 12,
            color: active ? '#ffffff' : '#cbd5e1',
            background: active
              ? 'linear-gradient(135deg,#3b82f6,#2563eb)'
              : 'transparent',
            fontWeight: active ? 800 : 600,
            fontSize: 14,
            transition: 'all 0.2s ease',
            boxShadow: active ? '0 8px 20px rgba(37,99,235,0.25)' : 'none',
          }}
        >
          <span style={{ fontSize: 18, width: 22, textAlign: 'center', flexShrink: 0 }}>
            {item.icon}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.label}
          </span>

          {item.badge && (
            <span style={{
              fontSize: 9, fontWeight: 900, color: '#ffffff',
              background: '#16a34a', padding: '2px 7px', borderRadius: 6,
              letterSpacing: 0.5, lineHeight: 1.4, flexShrink: 0,
              animation: 'badgePulse 2s ease-in-out infinite',
            }}>
              {item.badge}
            </span>
          )}
        </Link>

        {/* Expand/Collapse Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: expanded ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
            color: expanded ? '#93c5fd' : '#64748b',
            cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
            transition: 'all 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          title={expanded ? 'Close' : 'Business Types'}
        >
          ▼
        </button>
      </div>

      {/* ★ Business Type Sub-items */}
      {expanded && (
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            padding: '8px 6px',
            marginBottom: 4,
          }}
        >
          {bizTypes.map((biz) => {
            const isSelected = currentBiz === biz.id;
            return (
              <Link
                key={biz.id}
                href={`/production?biz=${biz.id}`}
                onClick={() => handleBizSelect(biz.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  background: isSelected
                    ? `linear-gradient(135deg, ${biz.color}cc, ${biz.color})`
                    : 'transparent',
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: 13,
                  transition: 'all 0.15s ease',
                  marginBottom: 2,
                  border: isSelected
                    ? `1px solid ${biz.color}`
                    : '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.color = '#e2e8f0';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#94a3b8';
                  }
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
                  {biz.icon}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lang === 'si' ? biz.si : biz.en}
                </span>
                {isSelected && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>●</span>
                )}
              </Link>
            );
          })}

          {/* All Production link */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: 6,
              paddingTop: 6,
            }}
          >
            <Link
              href="/production"
              onClick={() => {
                try { localStorage.removeItem('prod_bizType'); } catch {}
                onClick?.();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 10,
                textDecoration: 'none',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 700,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = '#e2e8f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <span style={{ fontSize: 14 }}>📋</span>
              <span>{TEXT[lang]?.allProduction || 'All Production'}</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SIDEBAR ITEM (Normal)
   ═══════════════════════════════════════ */
function SidebarItem({ item, active, collapsed, onClick }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
        padding: collapsed ? '12px 10px' : '12px 14px',
        borderRadius: 12,
        color: active ? '#ffffff' : '#cbd5e1',
        background: active
          ? 'linear-gradient(135deg,#3b82f6,#2563eb)'
          : 'transparent',
        fontWeight: active ? 800 : 600,
        fontSize: 14,
        transition: 'all 0.2s ease',
        justifyContent: collapsed ? 'center' : 'flex-start',
        boxShadow: active ? '0 8px 20px rgba(37,99,235,0.25)' : 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        position: 'relative',
      }}
      title={collapsed ? item.label : undefined}
    >
      <span style={{ fontSize: 18, width: 22, textAlign: 'center', flexShrink: 0 }}>
        {item.icon}
      </span>
      {!collapsed && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {item.label}
        </span>
      )}

      {!collapsed && item.badge && (
        <span
          style={{
            fontSize: 9, fontWeight: 900, color: '#ffffff',
            background: item.badgeColor || '#16a34a',
            padding: '2px 7px', borderRadius: 6,
            letterSpacing: 0.5, lineHeight: 1.4, flexShrink: 0,
            animation: 'badgePulse 2s ease-in-out infinite',
          }}
        >
          {item.badge}
        </span>
      )}

      {collapsed && item.badge && (
        <span
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 8, height: 8, borderRadius: '50%',
            background: item.badgeColor || '#16a34a',
            border: '2px solid #0f172a',
          }}
        />
      )}
    </Link>
  );
}

/* ═══════════════════════════════════════
   ★ MAIN SIDEBAR COMPONENT
   ═══════════════════════════════════════ */
export default function Sidebar({
  isOpen,
  onClose,
  isCollapsed,
  toggleCollapse,
  lang,
  setLang,
}) {
  const pathname = usePathname();
  const { user, logOut } = useUserAuth();
  const [isMobile, setIsMobile] = useState(false);

  const t    = TEXT[lang] || TEXT.si;
  const menu = useMemo(() => getMenu(t), [t]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const sidebarWidth   = isMobile ? 280 : (isCollapsed ? 70 : 280);
  const handleNavigate = () => { if (isMobile) onClose?.(); };

  const handleLangChange = (nextLang) => {
    if (nextLang !== 'si' && nextLang !== 'en') return;
    setLang?.(nextLang);
  };

  const handleLogout = async () => {
    try { await logOut?.(); onClose?.(); }
    catch (e) { console.error('Logout error:', e); }
  };

  return (
    <>
      <style>{`
        @keyframes badgePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}</style>

      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 199,
          }}
        />
      )}

      <aside
        style={{
          position: 'fixed', top: 0, left: 0,
          width: sidebarWidth, height: '100vh',
          background: 'linear-gradient(180deg,#0f172a 0%, #111827 100%)',
          color: 'white', zIndex: 200,
          transform: isMobile
            ? (isOpen ? 'translateX(0)' : 'translateX(-100%)')
            : 'translateX(0)',
          transition: 'transform 0.3s ease, width 0.3s ease',
          boxShadow: '8px 0 30px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ═══ Top / Logo ═══ */}
        <div
          style={{
            padding: isCollapsed && !isMobile ? '18px 10px' : '18px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center',
            justifyContent: isCollapsed && !isMobile ? 'center' : 'space-between',
            gap: 10, minHeight: 72,
          }}
        >
          {!(isCollapsed && !isMobile) && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', whiteSpace: 'nowrap' }}>
                🏪 {t.appName}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Admin Panel</div>
            </div>
          )}
          {isCollapsed && !isMobile && <div style={{ fontSize: 24 }}>🏪</div>}
          {!isMobile && (
            <button onClick={toggleCollapse} title={isCollapsed ? t.expand : t.collapse}
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer', flexShrink: 0 }}>
              {isCollapsed ? '>>' : '<<'}
            </button>
          )}
          {isMobile && (
            <button onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'white', cursor: 'pointer', flexShrink: 0 }}>
              X
            </button>
          )}
        </div>

        {/* ═══ User ═══ */}
        <div
          style={{
            padding: isCollapsed && !isMobile ? '14px 10px' : '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start' }}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'}
                style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.18)', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            {!(isCollapsed && !isMobile) && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.displayName || 'User'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {user?.email || ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Menu ═══ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {menu.map((group) => (
            <div key={group.section} style={{ marginBottom: 16 }}>
              {!(isCollapsed && !isMobile) && (
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, padding: '6px 10px', marginBottom: 6 }}>
                  {group.section}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  /* ★ Production item — use submenu */
                  if (item.hasSubmenu) {
                    return (
                      <ProductionSubmenu
                        key={item.href}
                        item={item}
                        active={active}
                        collapsed={isCollapsed && !isMobile}
                        onClick={handleNavigate}
                        lang={lang}
                      />
                    );
                  }

                  /* Normal item */
                  return (
                    <SidebarItem
                      key={item.href}
                      item={item}
                      active={active}
                      collapsed={isCollapsed && !isMobile}
                      onClick={handleNavigate}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ═══ Bottom ═══ */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Language */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: isCollapsed && !isMobile ? 8 : 10 }}>
            {!(isCollapsed && !isMobile) && (
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>{t.language}</div>
            )}
            <div style={{ display: 'flex', gap: 6, flexDirection: isCollapsed && !isMobile ? 'column' : 'row' }}>
              <button onClick={() => handleLangChange('si')} title={t.sinhala}
                style={{ flex: 1, padding: isCollapsed && !isMobile ? '10px 6px' : '9px 10px', borderRadius: 10, border: lang === 'si' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)', background: lang === 'si' ? '#1d4ed8' : 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                {isCollapsed && !isMobile ? 'si' : t.sinhala}
              </button>
              <button onClick={() => handleLangChange('en')} title={t.english}
                style={{ flex: 1, padding: isCollapsed && !isMobile ? '10px 6px' : '9px 10px', borderRadius: 10, border: lang === 'en' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)', background: lang === 'en' ? '#1d4ed8' : 'rgba(255,255,255,0.04)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                EN
              </button>
            </div>
          </div>

          {/* Logout */}
          <button onClick={handleLogout} title={t.logout}
            style={{ width: '100%', padding: isCollapsed && !isMobile ? '11px 8px' : '12px 14px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', cursor: 'pointer', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span>🚪</span>
            {!(isCollapsed && !isMobile) && <span>{t.logout}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';

// ═══════════════════════════════════════════════════════════
// WHATSAPP SUPPORT
// ═══════════════════════════════════════════════════════════
const WHATSAPP_NUMBER = '94787666999';
const WHATSAPP_MESSAGE = encodeURIComponent('හායි! මට POS System ගැන උදව් අවශ්‍යයි.');

// ═══════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════
const TRANSLATIONS = {
  si: {
    brandName: 'Weerakkodi POS',
    brandSub: 'ව්‍යාපාර කළමනාකරණය',
    dashboard: 'ප්‍රධාන පිටුව',
    pos: 'POS',
    quotation: 'කොටේෂන්',
    invoices: 'ඉන්වොයිස්',
    invoiceList: 'ඉන්වොයිස් ලැයිස්තුව',
    approved: 'අනුමත ඇණවුම්',
    customerOrders: 'පාරිභෝගික ඇණවුම්',
    customers: 'පාරිභෝගිකයින්',
    suppliers: 'සැපයුම්කරුවන්',
    returns: 'ආපසු භාර',
    vehicleIncome: 'වාහන ආදායම්',
    vehicleExpenses: 'වාහන වියදම්',
    shops: 'වෙළඳසැල්',
    catalogDemo: 'Catalog Demo',
    login: 'Login',
    settings: 'සැකසුම්',
    logout: 'ඉවත් වන්න',
    logoutConfirm: 'ඔබට ඉවත් වීමට අවශ්‍යද?',
    switchLang: 'English',
    searchMenu: 'මෙනුව සොයන්න...',
    noResults: 'ප්‍රතිඵල හමු නොවීය',
    secSales: 'විකුණුම්',
    secOrders: 'ඇණවුම්',
    secBusiness: 'ව්‍යාපාර',
    secSystem: 'පද්ධතිය',
    getSupport: 'උදව් ගන්න',
  },
  en: {
    brandName: 'Weerakkodi POS',
    brandSub: 'Business Manager',
    dashboard: 'Dashboard',
    pos: 'POS',
    quotation: 'Quotation',
    invoices: 'Invoices',
    invoiceList: 'Invoice List',
    approved: 'Approved Orders',
    customerOrders: 'Customer Orders',
    customers: 'Customers',
    suppliers: 'Suppliers',
    returns: 'Returns',
    vehicleIncome: 'Vehicle Income',
    vehicleExpenses: 'Vehicle Expenses',
    shops: 'Shops',
    catalogDemo: 'Catalog Demo',
    login: 'Login',
    settings: 'Settings',
    logout: 'Log Out',
    logoutConfirm: 'Are you sure you want to log out?',
    switchLang: 'සිංහල',
    searchMenu: 'Search menu...',
    noResults: 'No results found',
    secSales: 'SALES',
    secOrders: 'ORDERS',
    secBusiness: 'BUSINESS',
    secSystem: 'SYSTEM',
    getSupport: 'Get Support',
  },
};

// ═══════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════
function getMenuItems(t) {
  return [
    // ── SALES ──
    { id: 'dashboard', title: t.dashboard, icon: '🏠', path: '/', section: t.secSales },
    {
      id: 'sales', title: t.invoices, icon: '🧾', section: t.secSales,
      submenu: [
        { title: t.pos, path: '/pos' },
        { title: t.quotation, path: '/pos/quotation' },
        { title: t.invoiceList, path: '/invoice-list' },
        { title: t.returns, path: '/return' },
      ],
    },
    { id: 'customers', title: t.customers, icon: '👥', path: '/customers', section: t.secSales },

    // ── ORDERS ──
    {
      id: 'orders', title: t.customerOrders, icon: '📦', section: t.secOrders,
      submenu: [
        { title: t.approved, path: '/approved' },
        { title: t.customerOrders, path: '/customer-orders' },
      ],
    },

    // ── BUSINESS ──
    { id: 'suppliers', title: t.suppliers, icon: '🏭', path: '/suppliers', section: t.secBusiness },
    { id: 'vehicle-income', title: t.vehicleIncome, icon: '🚛', path: '/vehicle-income', section: t.secBusiness },
    { id: 'vehicle-expenses', title: t.vehicleExpenses, icon: '💸', path: '/vehicle-expenses', section: t.secBusiness },
    {
      id: 'shops', title: t.shops, icon: '🏪', section: t.secBusiness,
      submenu: [
        { title: t.shops, path: '/shops' },
        { title: t.catalogDemo, path: '/pfi/demo-shop' },
      ],
    },

    // ── SYSTEM ──
    { id: 'login', title: t.login, icon: '🔐', path: '/login', section: t.secSystem },
  ];
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ═══════════════════════════════════════════════════════════
export default function Sidebar({
  isOpen = true,
  onClose,
  isCollapsed = false,
  toggleCollapse,
  lang: externalLang,
  setLang: externalSetLang,
}) {
  const pathname = usePathname() || '/';

  // ── Hydration-safe language ──
  const [lang, setLangInternal] = useState(externalLang || 'si');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const syncLang = () => {
      try {
        const saved = localStorage.getItem('language');
        if (saved) setLangInternal(saved);
      } catch {}
    };
    const onLangChange = (e) => setLangInternal(e.detail || 'si');

    syncLang();
    window.addEventListener('app-language-change', onLangChange);
    window.addEventListener('storage', syncLang);
    return () => {
      window.removeEventListener('app-language-change', onLangChange);
      window.removeEventListener('storage', syncLang);
    };
  }, []);

  const safeLang = mounted ? lang : (externalLang || 'si');
  const t = TRANSLATIONS[safeLang] || TRANSLATIONS.si;
  const menuItems = useMemo(() => getMenuItems(t), [t]);

  // ── State ──
  const [expandedMenus, setExpandedMenus] = useState({});
  const [isMobile, setIsMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredItem, setHoveredItem] = useState(null);
  const [tooltipTop, setTooltipTop] = useState(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    menuItems.forEach((item) => {
      if (item.submenu) {
        const hasActive = item.submenu.some((sub) => checkActive(sub.path, pathname));
        if (hasActive) setExpandedMenus((prev) => ({ ...prev, [item.id]: true }));
      }
    });
  }, [pathname, menuItems]);

  // ── Helpers ──
  const checkActive = (path, currentPath = pathname) => {
    if (!path) return false;
    if (path === '/') return currentPath === '/';
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  const checkActiveChild = (submenu) =>
    submenu ? submenu.some((sub) => checkActive(sub.path)) : false;

  const handleToggleSubmenu = useCallback((menuId) => {
    if (isCollapsed && !isMobile && toggleCollapse) {
      toggleCollapse();
      setTimeout(() => setExpandedMenus((prev) => ({ ...prev, [menuId]: true })), 280);
    } else {
      setExpandedMenus((prev) => ({ ...prev, [menuId]: !prev[menuId] }));
    }
  }, [isCollapsed, isMobile, toggleCollapse]);

  const handleNavigate = useCallback((path) => {
    if (isMobile && onClose) onClose();
    window.location.href = path;
  }, [isMobile, onClose]);

  const handleLangToggle = () => {
    const newLang = lang === 'si' ? 'en' : 'si';
    setLangInternal(newLang);
    if (externalSetLang) externalSetLang(newLang);
    try { localStorage.setItem('language', newLang); } catch {}
    try { window.dispatchEvent(new CustomEvent('app-language-change', { detail: newLang })); } catch {}
  };

  const handleLogout = async () => {
    if (window.confirm(t.logoutConfirm)) {
      try { await signOut(getAuth()); }
      catch (e) { console.error('Logout error:', e); }
      finally { window.location.href = '/login'; }
    }
  };

  const handleHover = (e, item) => {
    if (isCollapsed && !isMobile) {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoveredItem(item);
      setTooltipTop(rect.top + rect.height / 2 - 16);
    }
  };

  // ── Filter ──
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return menuItems;
    const s = searchTerm.toLowerCase();
    return menuItems
      .map((item) => {
        const titleMatch = (item.title || '').toLowerCase().includes(s);
        const filteredSubmenu = item.submenu
          ? item.submenu.filter((sub) => (sub.title || '').toLowerCase().includes(s))
          : null;
        if (titleMatch) return item;
        if (filteredSubmenu?.length) return { ...item, submenu: filteredSubmenu };
        return null;
      })
      .filter(Boolean);
  }, [menuItems, searchTerm]);

  const showLabels = !isCollapsed || isMobile;
  const sidebarWidth = isMobile ? '280px' : (isCollapsed ? '72px' : '290px');

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <>
      {/* MOBILE OVERLAY */}
      {isMobile && isOpen && onClose && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            zIndex: 999, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside
        style={{
          position: 'fixed', top: 0, left: 0,
          height: '100vh', width: sidebarWidth,
          backgroundColor: '#0f172a', color: '#e2e8f0',
          zIndex: 1000, display: 'flex', flexDirection: 'column',
          transition: 'all 0.3s ease',
          transform: isMobile && !isOpen ? 'translateX(-100%)' : 'translateX(0)',
          boxShadow: isMobile && isOpen ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
          overflowX: 'hidden',
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            padding: isCollapsed && !isMobile ? '16px 8px' : '16px',
            borderBottom: '1px solid #1e293b',
            display: 'flex', alignItems: 'center', gap: 12,
            height: 68, flexShrink: 0,
            justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
          }}
        >
          <div
            style={{
              minWidth: 42, height: 42,
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, color: 'white', fontSize: 18, flexShrink: 0,
            }}
          >
            W
          </div>

          {showLabels && (
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 800, fontSize: 18,
                whiteSpace: 'nowrap', color: '#f8fafc',
                letterSpacing: '-0.3px',
              }}>
                {t.brandName}
              </div>
              <div style={{
                fontSize: 12, color: '#64748b',
                whiteSpace: 'nowrap', fontWeight: 500,
              }}>
                {t.brandSub}
              </div>
            </div>
          )}

          {!isMobile && toggleCollapse && (
            <button
              onClick={toggleCollapse}
              style={{
                marginLeft: showLabels ? 'auto' : 0,
                background: 'rgba(255,255,255,0.08)',
                border: 'none', color: '#94a3b8',
                cursor: 'pointer', borderRadius: 8,
                width: 32, height: 32,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13,
              }}
            >
              {isCollapsed ? '▶' : '◀'}
            </button>
          )}

          {isMobile && onClose && (
            <button
              onClick={onClose}
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.08)',
                border: 'none', color: '#94a3b8',
                cursor: 'pointer', borderRadius: 8,
                width: 32, height: 32,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 18,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* ── SEARCH ── */}
        {showLabels && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 15, color: '#475569', pointerEvents: 'none',
                }}
              >
                🔍
              </span>
              <input
                type="text"
                placeholder={t.searchMenu}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 34px 10px 40px',
                  background: '#1e293b',
                  border: '1.5px solid #334155',
                  borderRadius: 10, color: '#f1f5f9',
                  fontSize: 14, fontWeight: 500,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    color: '#64748b', cursor: 'pointer', fontSize: 14,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── MENU ITEMS ── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          {filteredItems.map((item) => {
            const isActive = item.path
              ? checkActive(item.path)
              : checkActiveChild(item.submenu);
            const isExpanded = expandedMenus[item.id];

            return (
              <React.Fragment key={item.id}>
                {/* Section header */}
                {item.section && showLabels && !searchTerm && (
                  <div
                    style={{
                      padding: '16px 18px 8px',
                      fontSize: 11, color: '#475569',
                      fontWeight: 800, letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}
                  >
                    ── {item.section} ──
                  </div>
                )}

                <div style={{ margin: '2px 0' }}>
                  {item.submenu ? (
                    <>
                      {/* Parent with submenu */}
                      <button
                        onClick={() => handleToggleSubmenu(item.id)}
                        onMouseEnter={(e) => handleHover(e, item)}
                        onMouseLeave={() => setHoveredItem(null)}
                        style={{
                          width: '100%',
                          padding: isCollapsed && !isMobile ? '12px 0' : '12px 16px',
                          display: 'flex', alignItems: 'center', gap: 12,
                          background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                          border: 'none',
                          color: isActive ? '#93c5fd' : '#cbd5e1',
                          cursor: 'pointer', textAlign: 'left',
                          fontSize: 15, fontWeight: isActive ? 700 : 500,
                          transition: 'all 0.15s',
                          justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
                          borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                        }}
                      >
                        <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>
                          {item.icon}
                        </span>
                        {showLabels && (
                          <>
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.title}
                            </span>
                            <span style={{ fontSize: 11, color: '#475569', marginRight: 4, fontWeight: 700 }}>
                              {item.submenu.length}
                            </span>
                            <span
                              style={{
                                fontSize: 10, color: '#475569',
                                transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              }}
                            >
                              ▶
                            </span>
                          </>
                        )}
                      </button>

                      {/* Submenu items */}
                      <div
                        style={{
                          maxHeight: isExpanded && showLabels
                            ? `${item.submenu.length * 44 + 12}px`
                            : '0px',
                          overflow: 'hidden',
                          transition: 'max-height 0.25s ease-in-out',
                          background: 'rgba(0,0,0,0.25)',
                        }}
                      >
                        {item.submenu.map((sub, idx) => {
                          const subActive = checkActive(sub.path);
                          return (
                            <button
                              key={idx}
                              onClick={() => handleNavigate(sub.path)}
                              style={{
                                width: '100%',
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 16px 10px 56px',
                                color: subActive ? '#93c5fd' : '#94a3b8',
                                background: subActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                                border: 'none',
                                borderLeft: subActive ? '3px solid #3b82f6' : '3px solid transparent',
                                textAlign: 'left', fontSize: 14,
                                fontWeight: subActive ? 700 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: subActive ? '#3b82f6' : '#475569',
                                  flexShrink: 0,
                                }}
                              />
                              <span>{sub.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    /* Direct link item */
                    <Link
                      href={item.path}
                      prefetch={false}
                      onClick={() => isMobile && onClose && onClose()}
                      onMouseEnter={(e) => handleHover(e, item)}
                      onMouseLeave={() => setHoveredItem(null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: isCollapsed && !isMobile ? '12px 0' : '12px 16px',
                        color: checkActive(item.path) ? '#ffffff' : '#cbd5e1',
                        textDecoration: 'none', fontSize: 15,
                        fontWeight: checkActive(item.path) ? 700 : 500,
                        transition: 'all 0.15s',
                        background: checkActive(item.path)
                          ? 'linear-gradient(90deg,rgba(59,130,246,0.28),rgba(59,130,246,0.08))'
                          : 'transparent',
                        borderLeft: checkActive(item.path)
                          ? '3px solid #3b82f6'
                          : '3px solid transparent',
                        justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
                      }}
                    >
                      <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>
                        {item.icon}
                      </span>
                      {showLabels && (
                        <span style={{
                          whiteSpace: 'nowrap', overflow: 'hidden',
                          textOverflow: 'ellipsis', flex: 1,
                        }}>
                          {item.title}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {/* No search results */}
          {searchTerm && filteredItems.length === 0 && (
            <div style={{
              padding: '30px 16px', textAlign: 'center',
              color: '#475569', fontSize: 14, fontWeight: 500,
            }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🔍</div>
              {t.noResults}
            </div>
          )}
        </nav>

        {/* ── BOTTOM SECTION ── */}
        <div
          style={{
            padding: '12px 14px', borderTop: '1px solid #1e293b',
            flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {/* ★ WhatsApp Support Button */}
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              width: '100%',
              padding: isCollapsed && !isMobile ? '11px 0' : '10px 14px',
              background: 'linear-gradient(135deg, #25d366, #128c7e)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
              gap: 10,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>💬</span>
            {showLabels && <span>{t.getSupport}</span>}
          </a>

          {/* Language toggle */}
          <button
            onClick={handleLangToggle}
            style={{
              width: '100%',
              padding: isCollapsed && !isMobile ? '11px 0' : '10px 14px',
              background: 'rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              border: '1px solid #1e293b',
              borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
              gap: 10, fontSize: 14, fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 18 }}>🌐</span>
            {showLabels && <span>{t.switchLang}</span>}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: isCollapsed && !isMobile ? '11px 0' : '10px 14px',
              background: 'rgba(239,68,68,0.12)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: isCollapsed && !isMobile ? 'center' : 'flex-start',
              gap: 10, fontWeight: 700, fontSize: 14,
            }}
          >
            <span style={{ fontSize: 18 }}>🚪</span>
            {showLabels && <span>{t.logout}</span>}
          </button>
        </div>

        {/* ── VERSION ── */}
        {showLabels && (
          <div style={{
            padding: '10px 14px', borderTop: '1px solid #1e293b', flexShrink: 0,
          }}>
            <div style={{
              fontSize: 11, color: '#334155',
              textAlign: 'center', fontWeight: 500,
            }}>
              v2.0.0 • © {new Date().getFullYear()}
            </div>
          </div>
        )}
      </aside>

      {/* ── TOOLTIP (collapsed mode) ── */}
      {isCollapsed && !isMobile && hoveredItem && (
        <div
          style={{
            position: 'fixed', left: '78px', top: `${tooltipTop}px`,
            background: '#1e293b', color: '#f1f5f9',
            padding: '10px 16px', borderRadius: 10,
            fontSize: 15, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 1001, whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid #334155',
          }}
        >
          <div
            style={{
              position: 'absolute', left: '-6px', top: '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              width: 10, height: 10, background: '#1e293b',
              borderLeft: '1px solid #334155',
              borderBottom: '1px solid #334155',
            }}
          />
          {hoveredItem.title}
        </div>
      )}
    </>
  );
}
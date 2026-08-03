'use client';

// components/DashboardShell.jsx
import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

/* ═══════════════════════════════════════
   WHATSAPP HELP BUTTON
   ═══════════════════════════════════════ */
function WhatsAppHelpButton() {
  const phone = '94787666999';
  const message = encodeURIComponent(
    'Hello, Weerakkodi POS app සඳහා උදව් අවශ්‍යයි.'
  );
  const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp Help"
      title="WhatsApp Help"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 9999,
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: 999,
          boxShadow: '0 10px 25px rgba(0,0,0,0.22)',
          fontWeight: 800,
          fontSize: 14,
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>💬</span>
        <span>WhatsApp Help</span>
      </div>
    </a>
  );
}

const isValidLang = (value) => value === 'si' || value === 'en';

export default function DashboardShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lang, setLang] = useState('si');
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load saved values
  useEffect(() => {
    setMounted(true);

    try {
      const savedLang = localStorage.getItem('language');
      if (isValidLang(savedLang)) setLang(savedLang);
    } catch {}

    try {
      const savedCollapsed = localStorage.getItem('sidebarCollapsed');
      if (savedCollapsed === 'true') setCollapsed(true);
    } catch {}
  }, []);

  // Save language + notify app
  useEffect(() => {
    if (!mounted) return;

    try {
      localStorage.setItem('language', lang);
    } catch {}

    window.dispatchEvent(
      new CustomEvent('app-language-change', { detail: lang })
    );
  }, [lang, mounted]);

  // Save collapse state only for desktop
  useEffect(() => {
    if (!mounted || isMobile) return;

    try {
      localStorage.setItem('sidebarCollapsed', String(collapsed));
    } catch {}
  }, [collapsed, isMobile, mounted]);

  // Responsive check
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);

      // desktop mode එකට ගියාම mobile drawer close කරන්න
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const contentMarginLeft = !isMobile ? (collapsed ? 70 : 280) : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
      }}
    >
      <Sidebar
        isOpen={isMobile ? sidebarOpen : true}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isMobile ? false : collapsed}
        toggleCollapse={() => setCollapsed((prev) => !prev)}
        lang={lang}
        setLang={setLang}
      />

      <div
        style={{
          marginLeft: contentMarginLeft,
          transition: 'margin-left 0.3s ease',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Header */}
        <header
          style={{
            height: 64,
            background: 'white',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ☰
              </button>
            )}

            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                Weerakkodi POS
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  marginTop: 2,
                }}
              >
                Dashboard
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color: '#64748b',
              fontWeight: 600,
              background: '#f8fafc',
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
            }}
          >
            {lang === 'si' ? 'සිංහල' : 'English'}
          </div>
        </header>

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            padding: isMobile ? 14 : 20,
            boxSizing: 'border-box',
          }}
        >
          {children}
        </main>
      </div>

      <WhatsAppHelpButton />
    </div>
  );
}
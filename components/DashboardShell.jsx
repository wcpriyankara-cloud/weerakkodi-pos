'use client';

// components/DashboardShell.jsx
import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function DashboardShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lang, setLang] = useState('si');
  const [isMobile, setIsMobile] = useState(false);

  // Load saved language + collapse state
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('language');
      if (savedLang) setLang(savedLang);
    } catch {}

    try {
      const savedCollapsed = localStorage.getItem('sidebarCollapsed');
      if (savedCollapsed === 'true') setCollapsed(true);
    } catch {}
  }, []);

  // Save language
  useEffect(() => {
    try {
      localStorage.setItem('language', lang);
    } catch {}
  }, [lang]);

  // Save collapse state
  useEffect(() => {
    try {
      localStorage.setItem('sidebarCollapsed', String(collapsed));
    } catch {}
  }, [collapsed]);

  // Responsive check
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);

      // mobile වලදී sidebar collapsed concept disable
      if (mobile) {
        setCollapsed(false);
      }
    };

    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const contentMarginLeft = isMobile ? 0 : (collapsed ? 70 : 280);

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
        toggleCollapse={() => setCollapsed((p) => !p)}
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
    </div>
  );
}
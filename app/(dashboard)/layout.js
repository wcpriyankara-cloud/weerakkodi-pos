'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [lang, setLang] = useState('si');

  useEffect(() => {
    const updateScreen = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
      else setSidebarOpen(false);
    };

    updateScreen();
    window.addEventListener('resize', updateScreen);
    return () => window.removeEventListener('resize', updateScreen);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('language') || 'si';
      setLang(saved);
    } catch {
      setLang('si');
    }
  }, []);

  const sidebarWidth = isMobile ? 0 : (collapsed ? 72 : 290);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={collapsed}
        toggleCollapse={() => setCollapsed((p) => !p)}
        lang={lang}
        setLang={setLang}
      />

      {/* ✅ Mobile top bar with menu button */}
      {isMobile && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 998,
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              background: 'white',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ☰
          </button>

          <div
            style={{
              fontWeight: 800,
              color: '#0f172a',
              fontSize: 17,
              flex: 1,
            }}
          >
            Weerakkodi POS
          </div>
        </div>
      )}

      {/* ✅ Main content */}
      <main
        style={{
          marginLeft: sidebarWidth,
          transition: 'margin-left 0.3s ease',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  );
}
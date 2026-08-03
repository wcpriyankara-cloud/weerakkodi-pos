'use client';

// app/(protected)/layout.js

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import DashboardShell from '@/components/DashboardShell';

function FullPageLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: 24,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: '28px 26px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
          minWidth: 220,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            margin: '0 auto 14px',
            borderRadius: '50%',
            border: '4px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            animation: 'protected-spin 0.8s linear infinite',
          }}
        />
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: '#0f172a',
            marginBottom: 4,
          }}
        >
          Loading...
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#64748b',
          }}
        >
          Checking access
        </div>

        <style>{`
          @keyframes protected-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function ProtectedLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useUserAuth();

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/${next}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return <FullPageLoader />;
  }

  if (!user) {
    return <FullPageLoader />;
  }

  return <DashboardShell>{children}</DashboardShell>;
}
'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CustomerCatalog from '@/components/CustomerCatalog';

export default function PfiPageClient() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const shopId       = searchParams?.get('shop') || '';

  useEffect(() => {
    if (shopId) {
      router.replace(`/pfi/${shopId}`);
    }
  }, [shopId, router]);

  if (shopId) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border: '4px solid #e2e8f0',
            borderTopColor: '#7c3aed',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>
          Redirecting...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <CustomerCatalog />;
}
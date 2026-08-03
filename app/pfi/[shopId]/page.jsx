'use client';

// app/pfi/[shopId]/page.jsx

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import CustomerCatalog from '@/components/CustomerCatalog';

function CatalogLoader() {
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
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <div
        style={{
          fontSize: 14,
          color: '#64748b',
          fontWeight: 600,
        }}
      >
        Loading...
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function ShopCatalogContent() {
  const params  = useParams();
  const shopId  = params?.shopId || '';

  return <CustomerCatalog shopId={shopId} />;
}

export default function ShopCatalogPage() {
  return (
    <Suspense fallback={<CatalogLoader />}>
      <ShopCatalogContent />
    </Suspense>
  );
}
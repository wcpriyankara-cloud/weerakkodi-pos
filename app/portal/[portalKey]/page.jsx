'use client';

import dynamic from 'next/dynamic';

const CustomerPortal = dynamic(
  () => import('@/components/CustomerPortal'),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 16 }}>
        ⏳ Loading portal...
      </div>
    ),
  }
);

export default function PortalPage() {
  return <CustomerPortal />;
}
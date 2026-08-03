import { Suspense } from 'react';
import PfiPageClient from './PfiPageClient';

function PfiLoader() {
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

export default function PfiPage() {
  return (
    <Suspense fallback={<PfiLoader />}>
      <PfiPageClient />
    </Suspense>
  );
}
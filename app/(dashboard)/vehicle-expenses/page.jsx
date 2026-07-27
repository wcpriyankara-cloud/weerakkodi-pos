'use client';

// app/(dashboard)/vehicle-expenses/page.js
// ═══════════════════════════════════════════════════════════════
// Vehicle Expense Manager Page — Next.js App Router
// ═══════════════════════════════════════════════════════════════

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const VehicleExpenseTab = dynamic(
  () => import('@/components/VehicleExpenseTab'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '60vh',
        gap: 16,
      }}>
        <div style={{
          width: 56,
          height: 56,
          border: '5px solid #e2e8f0',
          borderTopColor: '#ef4444',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{
          color: '#64748b',
          fontSize: 16,
          fontWeight: 600,
        }}>
          🚛 වාහන වියදම් පූරණය වෙමින්...
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    ),
  }
);

export default function VehicleExpensesPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60vh',
          gap: 16,
        }}>
          <div style={{
            width: 56,
            height: 56,
            border: '5px solid #e2e8f0',
            borderTopColor: '#ef4444',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#64748b', fontSize: 16, fontWeight: 600 }}>
            🚛 පූරණය වෙමින්...
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      }
    >
      <VehicleExpenseTab />
    </Suspense>
  );
}
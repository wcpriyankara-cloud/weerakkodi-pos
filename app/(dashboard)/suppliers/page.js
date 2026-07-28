'use client';

// app/(dashboard)/suppliers/page.js

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const Suppliers = dynamic(
  () => import('@/components/Suppliers'),
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
          borderTopColor: '#7c3aed',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{
          color: '#64748b',
          fontSize: 16,
          fontWeight: 600,
        }}>
          🏭 සැපයුම්කරුවන් පූරණය වෙමින්...
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    ),
  }
);

export default function SuppliersPage() {
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
            borderTopColor: '#7c3aed',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#64748b', fontSize: 16, fontWeight: 600 }}>
            🏭 පූරණය වෙමින්...
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      }
    >
      <Suppliers />
    </Suspense>
  );
}
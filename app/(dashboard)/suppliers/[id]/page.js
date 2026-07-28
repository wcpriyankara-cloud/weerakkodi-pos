'use client';

// app/(dashboard)/suppliers/[id]/page.js

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const SupplierReport = dynamic(
  () => import('@/components/SupplierReport'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f5f3ff',
        gap: 20,
      }}>
        <div style={{
          width: 60,
          height: 60,
          border: '5px solid #e2e8f0',
          borderTopColor: '#7c3aed',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <h2 style={{ color: '#7c3aed', margin: 0 }}>
          දත්ත පූරණය වෙමින්...
        </h2>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    ),
  }
);

export default function SupplierReportPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#f5f3ff',
          gap: 20,
        }}>
          <div style={{
            width: 60,
            height: 60,
            border: '5px solid #e2e8f0',
            borderTopColor: '#7c3aed',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <h2 style={{ color: '#7c3aed', margin: 0 }}>
            පූරණය වෙමින්...
          </h2>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      }
    >
      <SupplierReport />
    </Suspense>
  );
}
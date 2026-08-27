'use client';

// app/(protected)/cash-management/page.jsx
// ✅ Next.js Page Component for Cash Book (Cash Management)
// ✅ Fully responsive & integrated with global language settings

import React from 'react';
import CashManagement from '@/components/CashManagement';
import { useLang } from '@/hooks/useLang';

export default function CashManagementPage() {
  const { lang } = useLang();

  return <CashManagement lang={lang || 'si'} />;
}
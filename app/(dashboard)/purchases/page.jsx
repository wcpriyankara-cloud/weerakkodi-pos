'use client';

import PurchaseCommonForm from '@/components/PurchaseCommonForm';

export default function PurchasesPage() {
  return (
    <PurchaseCommonForm
      title="📦 ගැනුම් ඉන්වොයිස්"
      type="purchase"
      storageKey="purchases"
    />
  );
}

'use client';

import PurchaseCommonForm from '@/components/PurchaseCommonForm';

export default function PurchaseReturnPage() {
  return (
    <PurchaseCommonForm
      title="↩️ ගැනුම් ආපසු භාරදීම"
      type="purchase-return"
      storageKey="purchaseReturns"
    />
  );
}

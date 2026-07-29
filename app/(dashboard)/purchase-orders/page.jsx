// app/(dashboard)/purchase-orders/page.jsx
'use client';

import PurchaseCommonForm from '@/components/PurchaseCommonForm';

export default function PurchaseOrdersPage() {
  return (
    <PurchaseCommonForm
      title="📋 ගැනුම් ඇණවුම්"
      type="purchase-order"
      storageKey="purchaseOrders"
    />
  );
}
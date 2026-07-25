'use client';

import dynamic from 'next/dynamic';

const CustomerOrders = dynamic(
  () => import('@/components/CustomerOrders'),
  { ssr: false }
);

export default function CustomerOrdersPage() {
  return <CustomerOrders />;
}
'use client';

import { useRouter } from 'next/navigation';
import ItemFormPage from '@/components/items/ItemFormPage';

export default function AddItemPage() {
  const router = useRouter();
  return (
    <ItemFormPage
      mode="add"
      onSuccess={() => router.push('/items')}
      onCancel={() => router.push('/items')}
    />
  );
}
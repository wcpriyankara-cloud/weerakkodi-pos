'use client';

import { useParams, useRouter } from 'next/navigation';
import ItemFormPage from '@/components/items/ItemFormPage';

export default function EditItemPage() {
  const { id }  = useParams();
  const router  = useRouter();

  return (
    <ItemFormPage
      mode="edit"
      itemId={id}
      onSuccess={() => router.push('/items')}
      onCancel={() => router.push('/items')}
    />
  );
}
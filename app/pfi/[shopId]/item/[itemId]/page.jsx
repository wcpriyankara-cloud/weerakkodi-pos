import { redirect } from 'next/navigation';

export default function CustomerCatalogItemPage({ params }) {
  const { shopId, itemId } = params;
  redirect(`/pfi/${shopId}?highlight=${itemId}`);
}
import { redirect } from 'next/navigation';

export default async function CustomerCatalogItemPage({ params }) {
  const { shopId, itemId } = await params;
  redirect(/pfi/?highlight=);
}
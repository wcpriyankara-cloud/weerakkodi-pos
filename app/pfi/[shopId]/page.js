// catalog/app/pfi/[shopId]/page.js
import CatalogClient from './CatalogClient';

// ★ NO generateMetadata here — no Firebase server calls
// ★ NO redirect() here
// ★ Only pass shopId to client component

export default async function ShopCatalogPage({ params, searchParams }) {
  const { shopId } = await params;
  const sp = await searchParams;
  const highlightId = (sp?.highlight && sp.highlight !== 'undefined')
    ? sp.highlight
    : null;

  return (
    <CatalogClient
      shopId={shopId}
      shopInfo={{}}
      initialItems={[]}
      categories={[]}
      brands={[]}
      highlightId={highlightId}
    />
  );
}
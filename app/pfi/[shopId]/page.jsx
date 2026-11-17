import PfiShopClient from './PfiShopClient';

export async function generateStaticParams() {
  return [
    { shopId: 'default' },
    { shopId: 'detail' }
  ];
}

export const metadata = {
  title: 'Shop Catalog',
};

export default function Page({ params }) {
  const shopId = params?.shopId;
  return <PfiShopClient shopId={shopId} />;
}

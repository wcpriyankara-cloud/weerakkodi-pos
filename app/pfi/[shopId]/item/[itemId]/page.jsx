import PfiItemClient from './PfiItemClient';

// ✅ Parameters 2 ම අඩංගු වන පරිදි static parameters generate කිරීම
export async function generateStaticParams() {
  return [
    { shopId: 'default', itemId: 'default' },
    { shopId: 'detail', itemId: 'detail' }
  ];
}

export const metadata = {
  title: 'භාණ්ඩ විස්තර | Item Details',
  description: 'View product details',
};

export default function PfiItemPage({ params }) {
  const { shopId, itemId } = params;
  return <PfiItemClient shopId={shopId} itemId={itemId} />;
}
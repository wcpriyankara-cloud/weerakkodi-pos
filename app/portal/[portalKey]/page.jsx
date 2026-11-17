import CustomerPortal from '@/components/CustomerPortal';

// ✅ Static export compilation එක සාර්ථක වීමට dynamic parameters අර්ථ දක්වයි
export async function generateStaticParams() {
  return [
    { portalKey: 'default' },
    { portalKey: 'detail' }
  ];
}

export const metadata = {
  title: 'Customer Portal | Weerakkodi POS',
  description: 'View invoices and payment history',
};

export default function PortalPage({ params }) {
  const { portalKey } = params;
  return <CustomerPortal portalKey={portalKey} />;
}
import CustomerDetailClient from './CustomerDetailClient';

// ✅ Next.js Server Component Static Params for Static HTML Export
export function generateStaticParams() {
  return [
    { id: '1' },
    { id: 'view' },
    { id: 'detail' },
    { id: 'preview' }
  ];
}

export default function CustomerDetailPage() {
  return <CustomerDetailClient lang="si" />;
}

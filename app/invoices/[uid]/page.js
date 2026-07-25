// catalog/app/invoices/[uid]/page.js
import InvoiceListClient from './InvoiceListClient';

export const metadata = {
  title: 'ඉන්වොයිස් ලැයිස්තුව',
  description: 'Invoice history and management',
};

export default async function InvoicePage({ params }) {
  const { uid } = await params;
  return <InvoiceListClient uid={uid} />;
}
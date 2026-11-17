'use client';

import dynamic from 'next/dynamic';

// @/ වෙනුවට සාපේක්ෂ මාර්ගය (Relative Path) භාවිතයෙන් Root components/Customers.jsx වෙත සෘජුවම යොමු කරයි
const Customers = dynamic(() => import('../../../components/Customers'), {
  ssr: false,
  loading: () => (
    <div className="p-6 text-center text-gray-500 font-semibold">
      පාරිබෝගික පිටුව පූරණය වෙමින් පවතී (Loading)...
    </div>
  )
});

export default function CustomersPage() {
  return (
    <main className="p-4">
      <Customers lang="si" />
    </main>
  );
}
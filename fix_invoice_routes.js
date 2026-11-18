// fix_invoice_routes.js
const fs = require('fs');
const path = require('path');

console.log('🔧 Inspecting and repairing invoice dynamic routes...');

const invoiceDirs = [
  {
    dir: path.join(__dirname, 'app', 'invoices', '[uid]', '[invoiceId]'),
    params: [{ uid: 'default', invoiceId: 'default' }],
    componentName: 'InvoiceDetailClient'
  },
  {
    dir: path.join(__dirname, 'app', 'invoices', '[uid]'),
    params: [{ uid: 'default' }],
    componentName: 'UserInvoicesClient'
  },
  {
    dir: path.join(__dirname, 'src', 'app', 'invoices', '[uid]', '[invoiceId]'),
    params: [{ uid: 'default', invoiceId: 'default' }],
    componentName: 'InvoiceDetailClient'
  },
  {
    dir: path.join(__dirname, 'src', 'app', 'invoices', '[uid]'),
    params: [{ uid: 'default' }],
    componentName: 'UserInvoicesClient'
  }
];

invoiceDirs.forEach(({ dir, params, componentName }) => {
  if (!fs.existsSync(dir)) return;

  const pageFiles = ['page.js', 'page.jsx', 'page.tsx'];
  let pagePath = null;
  for (const pf of pageFiles) {
    const full = path.join(dir, pf);
    if (fs.existsSync(full)) {
      pagePath = full;
      break;
    }
  }

  if (!pagePath) return;

  console.log('Patching route in:', dir);

  // Read existing content
  let originalCode = fs.readFileSync(pagePath, 'utf8');

  // Client Component file path
  const clientFilePath = path.join(dir, 'InvoiceClientComponent.jsx');

  // If client component doesn't exist yet, extract the original code
  if (!fs.existsSync(clientFilePath)) {
    // Ensure 'use client' is at the top
    let clientCode = originalCode;
    // Remove static params if they got appended into client file
    clientCode = clientCode.replace(/export\s+async\s+function\s+generateStaticParams[\s\S]*?dynamicParams\s*=\s*false;?/g, '');
    if (!clientCode.includes("'use client'") && !clientCode.includes('"use client"')) {
      clientCode = `'use client';\n\n` + clientCode;
    }
    fs.writeFileSync(clientFilePath, clientCode, 'utf8');
    console.log('   ✅ Saved client implementation to InvoiceClientComponent.jsx');
  }

  // Create clean Server Page wrapper with generateStaticParams and Suspense
  const serverWrapperCode = `// Server wrapper for static export
import React, { Suspense } from 'react';
import InvoiceClientComponent from './InvoiceClientComponent';

export async function generateStaticParams() {
  return ${JSON.stringify(params, null, 2)};
}

export const dynamicParams = false;

export default function InvoiceStaticPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-slate-400 flex items-center justify-center p-6">Loading Invoice...</div>}>
      <InvoiceClientComponent />
    </Suspense>
  );
}
`;

  fs.writeFileSync(pagePath, serverWrapperCode, 'utf8');
  console.log('   ✅ Updated page wrapper with clean default export.');
});

console.log('🎉 Invoice dynamic routes repaired successfully!');
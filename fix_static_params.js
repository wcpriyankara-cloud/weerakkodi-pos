// fix_static_params.js
const fs = require('fs');
const path = require('path');

console.log('🔍 Scanning and fixing all dynamic routes for static export...');

function findDynamicRouteDirs(baseDir) {
  const dynamicDirs = [];
  if (!fs.existsSync(baseDir)) return dynamicDirs;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
          dynamicDirs.push(fullPath);
        }
        walk(fullPath);
      }
    }
  }

  walk(baseDir);
  return dynamicDirs;
}

const appRoots = [
  path.join(__dirname, 'app'),
  path.join(__dirname, 'src', 'app')
];

appRoots.forEach(appRoot => {
  if (!fs.existsSync(appRoot)) return;
  const dynDirs = findDynamicRouteDirs(appRoot);

  dynDirs.forEach(dir => {
    const pageFiles = ['page.jsx', 'page.js', 'page.tsx', 'page.ts'];
    let targetPage = null;

    for (const pf of pageFiles) {
      const full = path.join(dir, pf);
      if (fs.existsSync(full)) {
        targetPage = full;
        break;
      }
    }

    if (!targetPage) return;

    console.log('🔧 Inspecting dynamic route:', targetPage);
    let content = fs.readFileSync(targetPage, 'utf8');

    // Extract all param names from the directory path (e.g. [id], [shopId], [itemId])
    const relative = path.relative(appRoot, dir).replace(/\\/g, '/');
    const paramMatches = [...relative.matchAll(/\[([^\]]+)\]/g)];
    const params = paramMatches.map(m => m[1].replace('...', '')); // remove rest if any

    const dummyParamObject = {};
    params.forEach(p => {
      dummyParamObject[p] = 'default';
    });

    const isClient = content.includes("'use client'") || content.includes('"use client"');

    if (isClient) {
      // For Client Components: Extract client code to DynamicClient.jsx and keep page.jsx as Server Component
      const clientFileName = 'DynamicClient.jsx';
      const clientFilePath = path.join(dir, clientFileName);

      fs.writeFileSync(clientFilePath, content, 'utf8');
      console.log(`   Created ${clientFileName} for client logic.`);

      // Create Server Page wrapper with generateStaticParams
      const serverPageCode = `// Auto-generated static export wrapper
import DynamicClient from './DynamicClient';

export async function generateStaticParams() {
  return [
    ${JSON.stringify(dummyParamObject, null, 4)}
  ];
}

export const dynamicParams = false;

export default function DynamicExportPage(props) {
  return <DynamicClient {...props} />;
}
`;
      fs.writeFileSync(targetPage, serverPageCode, 'utf8');
      console.log('   ✅ Wrapped client component with generateStaticParams() in page.');
    } else {
      // Server Component: ensure generateStaticParams exists
      if (!content.includes('generateStaticParams')) {
        const staticParamsCode = `
export async function generateStaticParams() {
  return [
    ${JSON.stringify(dummyParamObject, null, 4)}
  ];
}

export const dynamicParams = false;
`;
        content = content + '\n' + staticParamsCode;
        fs.writeFileSync(targetPage, content, 'utf8');
        console.log('   ✅ Appended generateStaticParams() to server page.');
      }
    }
  });
});

console.log('🎉 All dynamic routes successfully updated for Next.js static export!');
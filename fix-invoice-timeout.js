const fs = require('fs');
const path = require('path');

const invPath = path.join(__dirname, 'components', 'InvoiceList.jsx');
let code = fs.readFileSync(invPath, 'utf8');
let changes = 0;

// ============================================
// 1. Add getDocsFromServer import
// ============================================
if (!code.includes('getDocsFromServer')) {
  // Add to existing firebase/firestore import
  code = code.replace(
    /from\s*['"]firebase\/firestore['"]/,
    (match) => {
      // Check if getDocsFromServer is already there
      if (code.includes('getDocsFromServer')) return match;
      return match;
    }
  );
  
  // Find the firestore import line and add getDocsFromServer
  const fsImportPattern = /(collection,\s*getDocs,\s*query)/;
  if (fsImportPattern.test(code)) {
    code = code.replace(
      fsImportPattern,
      'collection, getDocs, getDocsFromServer, query'
    );
    changes++;
    console.log('✅ Added getDocsFromServer import');
  } else {
    // Try alternative pattern
    const altPattern = /(getDocs,)/;
    if (altPattern.test(code)) {
      code = code.replace(altPattern, 'getDocs, getDocsFromServer,');
      changes++;
      console.log('✅ Added getDocsFromServer import (alt)');
    }
  }
}

// ============================================
// 2. Replace getDocs with getDocsFromServer for cloud fetch
// ============================================
// The cloud fetch at ~L127 uses getDocs which tries cache first
// Replace with getDocsFromServer to force server fetch
if (code.includes('return await getDocs(q)') && !code.includes('getDocsFromServer(q)')) {
  code = code.replace(
    'return await getDocs(q)',
    `// 🔧 Force server fetch (bypass empty local cache)
      try {
        return await getDocsFromServer(q);
      } catch(serverErr) {
        console.log('📋 Server fetch failed, trying cache:', serverErr?.message);
        return await getDocs(q);
      }`
  );
  changes++;
  console.log('✅ Replaced getDocs with getDocsFromServer for cloud fetch');
}

// ============================================
// 3. Increase timeout / add retry for invoice fetch
// ============================================
// Find the cloud fetch try-catch and add retry logic
if (code.includes('Cloud invoices fetch skipped') && !code.includes('RETRY INVOICE FETCH')) {
  code = code.replace(
    /console\.warn\(["']Cloud invoices fetch skipped \(offline mode\)["'],\s*cloudErr\?\.message\);/,
    `console.warn("Cloud invoices fetch skipped:", cloudErr?.message);
      // 🔧 RETRY INVOICE FETCH - wait 3s and try again
      try {
        console.log('📋 Retrying invoice fetch in 3s...');
        await new Promise(r => setTimeout(r, 3000));
        const retryQ = query(collection(db, 'users', uid, 'invoices'));
        const retrySnap = await getDocsFromServer(retryQ);
        const retryDocs = retrySnap.docs.map(d => ({ id: d.id, ...d.data() }));
        retryDocs.forEach(inv => {
          const id = inv.id || inv.invoiceNo;
          if (id) invoiceMap.set(id, { ...inv, _source: 'cloud' });
        });
        console.log('📋 Retry success: ' + retryDocs.length + ' invoices');
      } catch(retryErr) {
        console.log('📋 Retry also failed:', retryErr?.message);
      }`
  );
  changes++;
  console.log('✅ Added invoice fetch retry logic');
}

// ============================================
// 4. Ensure Dexie data is shown even when cloud fails
// ============================================
// The combined array should include Dexie data regardless of cloud result
if (code.includes('const combined = Array.from(invoiceMap.values())')) {
  // This is already correct - invoiceMap includes both Dexie and cloud
  console.log('⏭️ Combined array logic already correct');
}

// ============================================
// 5. Add console log for debugging
// ============================================
if (!code.includes('INVOICE DEBUG')) {
  code = code.replace(
    /const combined = Array\.from\(invoiceMap\.values\(\)\)/,
    `console.log('📋 INVOICE DEBUG: invoiceMap size =', invoiceMap.size, '| Dexie local =', allLocal?.length || 0);
    const combined = Array.from(invoiceMap.values())`
  );
  changes++;
  console.log('✅ Added invoice debug log');
}

fs.writeFileSync(invPath, code, 'utf8');

console.log(`\n🎉 Total ${changes} fixes applied to InvoiceList.jsx!`);
console.log('🔄 App restart: Ctrl+C → npm run dev');
console.log('\n📌 බලාපොරොත්තු වන Console output:');
console.log('   📋 INVOICE DEBUG: invoiceMap size = X | Dexie local = Y');
console.log('   📋 Server fetch: Z invoices (from Firestore)');
console.log('   📋 Retry success: Z invoices (if first attempt failed)');
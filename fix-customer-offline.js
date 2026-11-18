const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Ensure setDoc is imported
if (!c.includes('setDoc')) {
  c = c.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]firebase\/firestore['"]/,
    (m, inner) => {
      if (inner.includes('setDoc')) return m;
      return m.replace(inner, inner + ', setDoc');
    }
  );
  console.log('Added setDoc import');
}

// 2. Replace handleCreateCustomer to be Dexie-first
const oldCust = `const cr = await addDoc(collection(db, 'customers'), cd);
      if (isMountedRef.current) { setSelectedCustomer({ id: cr.id, ...cd }); setShowNewCustomerModal(false); setNewCustomer({ name: '', phone: '+94', address: '', creditLimit: 0, profilePicture: '' }); showToast(t.customerCreated); }
    } catch (e) { if (isMountedRef.current) showToast(\`❌ \${e.message}\`); }`;

const newCust = `const custRef = doc(collection(db, 'customers'));
      const custId = custRef.id;
      let dexieOk = false;
      try { await localDb.customers.put({ id: custId, ...cd, _localSaved: true, _synced: false }); dexieOk = true; } catch(de) { console.warn('Dexie cust fail:', de); }
      let fsOk = false;
      try { await setDoc(custRef, cd); fsOk = true; if (dexieOk) { try { await localDb.customers.update(custId, { _synced: true }); } catch(e2) {} } } catch(fe) { console.warn('FS cust skip:', fe.message); }
      if (isMountedRef.current) { setSelectedCustomer({ id: custId, ...cd }); setShowNewCustomerModal(false); setNewCustomer({ name: '', phone: '+94', address: '', creditLimit: 0, profilePicture: '' }); showToast(fsOk ? t.customerCreated : dexieOk ? '⚠️ Customer offline — sync later' : '❌ Save failed'); }
    } catch (e) { if (isMountedRef.current) showToast(\`❌ \${e.message}\`); }`;

if (c.includes(oldCust)) {
  c = c.replace(oldCust, newCust);
  fs.writeFileSync(f, c, 'utf8');
  console.log('OK - handleCreateCustomer is now Dexie-first!');
} else {
  console.log('Exact match failed. Trying flexible...');
  const idx = c.indexOf('const cr = await addDoc(collection(db,');
  if (idx !== -1) {
    console.log('Found addDoc at', idx);
    console.log('NEARBY:', JSON.stringify(c.substring(idx, idx + 300)));
  } else {
    console.log('addDoc(customers) NOT FOUND');
  }
}
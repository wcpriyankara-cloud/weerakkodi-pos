const fs = require('fs');
const f = 'components/POSInvoice.jsx';
let c = fs.readFileSync(f, 'utf8');

const marker = "const cr = await addDoc(collection(db, 'customers'), cd);";
const idx = c.indexOf(marker);
if (idx === -1) { console.log('NOT FOUND'); process.exit(); }

const endMarker = "} catch (e) { if (isMountedRef.current) showToast(`";
const endIdx = c.indexOf(endMarker, idx);
if (endIdx === -1) { console.log('END NOT FOUND'); process.exit(); }

const replacement = `const custRef = doc(collection(db, 'customers'));
      const custId = custRef.id;
      let dexieOk = false;
      try { await localDb.customers.put({ id: custId, ...cd, _localSaved: true, _synced: false }); dexieOk = true; } catch(de) { console.warn('Dexie cust fail:', de); }
      let fsOk = false;
      try { await setDoc(custRef, cd); fsOk = true; if (dexieOk) { try { await localDb.customers.update(custId, { _synced: true }); } catch(e2) {} } } catch(fe) { console.warn('FS cust skip:', fe.message); }
      if (isMountedRef.current) { setSelectedCustomer({ id: custId, ...cd }); setShowNewCustomerModal(false); setNewCustomer({ name: '', phone: '+94', address: '', creditLimit: 0, profilePicture: '' }); showToast(fsOk ? t.customerCreated : dexieOk ? '⚠️ Customer offline — sync later' : '❌ Save failed'); }
    `;

c = c.substring(0, idx) + replacement + c.substring(endIdx);
fs.writeFileSync(f, c, 'utf8');
console.log('OK - handleCreateCustomer is now Dexie-first!');
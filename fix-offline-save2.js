const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'components', 'POSInvoice.jsx');
let c = fs.readFileSync(f, 'utf8');

// Find and replace the try/catch block inside handleSaveInvoice
// OLD block starts with: try {\n      const fbBatch = writeBatch(db);
// OLD block ends with: } catch (e) { console.error('Save error:', e); ... }

const oldBlock = `    try {
      const fbBatch = writeBatch(db);
      const invRef = doc(collection(db, actionType === 'draft' ? 'drafts' : 'invoices'));
      const invoiceId = invRef.id, invoiceNo = \`INV-\${invoiceId.slice(0, 8).toUpperCase()}\`;

      const { totalCost, hasCost } = calculateCostSummary(snap.items);
      const totalSellingRevenue = calculateSellingRevenue(snap.items);

      fbBatch.set(invRef, buildInvoicePayload({ 
        user, snap, invoiceNo, actionType, mode, isFullCredit,
        previousOutstanding: customerBalanceBefore,
        newOutstanding:      customerBalanceAfter
      }));

      if (actionType !== 'draft') {
        const deductions = buildDeductionMap(snap.items);
        Object.entries(deductions).forEach(([id, qty]) => {
          fbBatch.update(doc(db, 'items', id), { stock: increment(-qty), currentStock: increment(-qty), 'stocks.Main_Store': increment(-qty) });
        });
        await applyBatchSourceUpdates(fbBatch, buildBatchUpdateMap(snap.items));
        
        if (isPersistedCustomer(snap.customer)) {
          fbBatch.update(doc(db, 'customers', snap.customer.id), { currentBalance: customerBalanceAfter });
        }
        
        if (snap.paymentMethod === 'etransfer' && snap.bankAccountId && snap.bankAccount) {
          fbBatch.update(doc(db, \`users/\${user.uid}/bankAccounts\`, snap.bankAccountId), { currentBalance: increment(R2(snap.payAmount)), updatedAt: new Date().toISOString() });
          fbBatch.set(doc(collection(db, \`users/\${user.uid}/bankTransactions\`)), { type: 'deposit', accountId: snap.bankAccountId, amount: R2(snap.payAmount), date: new Date().toISOString(), description: \`Invoice - \${snap.customer.name}\`, createdAt: new Date().toISOString(), source: 'pos-invoice', invoiceId });
        }
        if (snap.netAmount > 0) {
          fbBatch.set(doc(collection(db, \`users/\${user.uid}/cashTransactions\`)), buildCashTransactionPayload({ user, snap, invoiceId, invoiceNo, mode, actualCashReceived, totalSellingRevenue, totalCost, hasCost, isCreditSale, creditAmount, isFullCredit }));
        }
      }

      await fbBatch.commit();
      if (!isMountedRef.current) { savingRef.current = false; return; }
      showToast(\`✅ \${t.successMsg}\`);
      
      if (actionType === 'print' || actionType === 'link') {
        const custWithKey = actionType === 'link' ? await ensurePortalKey(snap.customer) : snap.customer;
        setOutputInvoice(buildOutputInvoicePayload({ 
          invoiceId, invoiceNo, user, snap, isFullCredit, actionType, custWithKey,
          previousOutstanding: customerBalanceBefore,
          newOutstanding:      customerBalanceAfter
        }));
      }
      clearForm();
    } catch (e) { console.error('Save error:', e); if (isMountedRef.current) showToast(\`❌ \${e.message}\`); }`;

const newBlock = `    // Generate IDs first (works offline)
    const invRef = doc(collection(db, actionType === 'draft' ? 'drafts' : 'invoices'));
    const invoiceId = invRef.id, invoiceNo = \`INV-\${invoiceId.slice(0, 8).toUpperCase()}\`;
    const { totalCost, hasCost } = calculateCostSummary(snap.items);
    const totalSellingRevenue = calculateSellingRevenue(snap.items);
    const invoicePayload = buildInvoicePayload({
      user, snap, invoiceNo, actionType, mode, isFullCredit,
      previousOutstanding: customerBalanceBefore,
      newOutstanding:      customerBalanceAfter
    });

    // ✅ STEP 1: Dexie local save FIRST (always works)
    let dexieSaved = false;
    try {
      await localDb.invoices.put({
        id: invoiceId,
        invoiceNo,
        uid: user.uid,
        ...invoicePayload,
        _localSaved: true,
        _synced: false,
        _savedAt: new Date().toISOString()
      });
      dexieSaved = true;
      console.log('[Offline] Invoice saved to Dexie:', invoiceId);
    } catch (dexErr) {
      console.error('[Dexie] Save failed:', dexErr);
    }

    // ✅ STEP 2: Try Firestore (may fail offline)
    let firestoreOk = false;
    try {
      const fbBatch = writeBatch(db);
      fbBatch.set(invRef, invoicePayload);

      if (actionType !== 'draft') {
        const deductions = buildDeductionMap(snap.items);
        Object.entries(deductions).forEach(([id, qty]) => {
          fbBatch.update(doc(db, 'items', id), { stock: increment(-qty), currentStock: increment(-qty), 'stocks.Main_Store': increment(-qty) });
        });
        await applyBatchSourceUpdates(fbBatch, buildBatchUpdateMap(snap.items));
        
        if (isPersistedCustomer(snap.customer)) {
          fbBatch.update(doc(db, 'customers', snap.customer.id), { currentBalance: customerBalanceAfter });
        }
        
        if (snap.paymentMethod === 'etransfer' && snap.bankAccountId && snap.bankAccount) {
          fbBatch.update(doc(db, \`users/\${user.uid}/bankAccounts\`, snap.bankAccountId), { currentBalance: increment(R2(snap.payAmount)), updatedAt: new Date().toISOString() });
          fbBatch.set(doc(collection(db, \`users/\${user.uid}/bankTransactions\`)), { type: 'deposit', accountId: snap.bankAccountId, amount: R2(snap.payAmount), date: new Date().toISOString(), description: \`Invoice - \${snap.customer.name}\`, createdAt: new Date().toISOString(), source: 'pos-invoice', invoiceId });
        }
        if (snap.netAmount > 0) {
          fbBatch.set(doc(collection(db, \`users/\${user.uid}/cashTransactions\`)), buildCashTransactionPayload({ user, snap, invoiceId, invoiceNo, mode, actualCashReceived, totalSellingRevenue, totalCost, hasCost, isCreditSale, creditAmount, isFullCredit }));
        }
      }

      await fbBatch.commit();
      firestoreOk = true;
      // Mark as synced in Dexie
      if (dexieSaved) {
        try { await localDb.invoices.update(invoiceId, { _synced: true }); } catch(e) {}
      }
    } catch (fsErr) {
      console.warn('[Offline] Firestore save skipped:', fsErr.message);
    }

    // ✅ STEP 3: Show result & cleanup
    if (!isMountedRef.current) { savingRef.current = false; return; }
    if (firestoreOk) {
      showToast(\`✅ \${t.successMsg}\`);
    } else if (dexieSaved) {
      showToast(\`⚠️ \${t.offlineSaved || 'Offline save — online උනාම sync වේ'}\`);
    } else {
      showToast(\`❌ Save failed\`);
    }
    
    if (actionType === 'print' || actionType === 'link') {
      try {
        const custWithKey = actionType === 'link' ? await ensurePortalKey(snap.customer) : snap.customer;
        setOutputInvoice(buildOutputInvoicePayload({ 
          invoiceId, invoiceNo, user, snap, isFullCredit, actionType, custWithKey,
          previousOutstanding: customerBalanceBefore,
          newOutstanding:      customerBalanceAfter
        }));
      } catch(e) { console.warn('Output error:', e); }
    }
    clearForm();
    // Trigger background sync + backup
    if (typeof syncAll === 'function') { try { syncAll(); } catch(e) {} }
    if (typeof triggerLocalDiskBackup === 'function') { try { triggerLocalDiskBackup(); } catch(e) {} }`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync(f, c, 'utf8');
  console.log('✅ handleSaveInvoice fixed! Dexie-first offline save added.');
} else {
  console.log('❌ Old block not found exactly. Trying flexible match...');
  
  // Fallback: find the key markers
  const startMarker = 'const fbBatch = writeBatch(db);';
  const endMarker = "} catch (e) { console.error('Save error:', e);";
  
  const startIdx = c.indexOf(startMarker);
  const endIdx = c.indexOf(endMarker);
  
  if (startIdx > -1 && endIdx > startIdx) {
    // Find the "try {" before fbBatch
    const tryIdx = c.lastIndexOf('try {', startIdx);
    // Find the end of catch block
    const catchEnd = c.indexOf('}', c.indexOf('}', endIdx) + 1) + 1;
    
    console.log('Found try at char ' + tryIdx + ', catch end at ' + catchEnd);
    console.log('Block length: ' + (catchEnd - tryIdx) + ' chars');
    console.log('Please manually verify. Showing first 200 chars of block:');
    console.log(c.substring(tryIdx, tryIdx + 200));
  } else {
    console.log('Markers not found. startIdx=' + startIdx + ' endIdx=' + endIdx);
  }
}
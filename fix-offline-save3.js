const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'components', 'POSInvoice.jsx');
let c = fs.readFileSync(f, 'utf8');

const startMarker = 'const fbBatch = writeBatch(db);';
const endMarker = "} catch (e) { console.error('Save error:', e);";

const startIdx = c.indexOf(startMarker);
const endIdx = c.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found!');
  process.exit(1);
}

// Find "try {" before fbBatch
const tryIdx = c.lastIndexOf('try {', startIdx);
// Find the closing of catch: "} catch (e) { ... }" 
// We need the final } of the catch block
const catchStart = endIdx;
// Find "if (isMountedRef.current) showToast" after catch
const toastIdx = c.indexOf('showToast(`', catchStart);
// Find the closing }; of the catch
const catchClose = c.indexOf('}', toastIdx + 30);
const finalClose = c.indexOf('}', catchClose + 1);

console.log('tryIdx:', tryIdx);
console.log('finalClose:', finalClose);
console.log('Replacing', finalClose - tryIdx + 1, 'chars');

const newCode = `// Generate IDs first (works offline)
    const invRef = doc(collection(db, actionType === 'draft' ? 'drafts' : 'invoices'));
    const invoiceId = invRef.id, invoiceNo = \`INV-\${invoiceId.slice(0, 8).toUpperCase()}\`;
    const { totalCost, hasCost } = calculateCostSummary(snap.items);
    const totalSellingRevenue = calculateSellingRevenue(snap.items);
    const invoicePayload = buildInvoicePayload({
      user, snap, invoiceNo, actionType, mode, isFullCredit,
      previousOutstanding: customerBalanceBefore,
      newOutstanding:      customerBalanceAfter
    });

    // STEP 1: Dexie local save FIRST (always works offline)
    let dexieSaved = false;
    try {
      await localDb.invoices.put({
        id: invoiceId, invoiceNo, uid: user.uid,
        ...invoicePayload,
        _localSaved: true, _synced: false,
        _savedAt: new Date().toISOString()
      });
      dexieSaved = true;
      console.log('[Offline] Dexie save OK:', invoiceId);
    } catch (dexErr) {
      console.error('[Dexie] Save failed:', dexErr);
    }

    // STEP 2: Try Firestore (may fail offline)
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
      if (dexieSaved) { try { await localDb.invoices.update(invoiceId, { _synced: true }); } catch(e2) {} }
    } catch (fsErr) {
      console.warn('[Offline] Firestore skipped:', fsErr.message);
    }

    // STEP 3: Result
    if (!isMountedRef.current) { savingRef.current = false; return; }
    if (firestoreOk) {
      showToast(\`✅ \${t.successMsg}\`);
    } else if (dexieSaved) {
      showToast(\`⚠️ Offline save — online උනාම sync වේ\`);
    } else {
      showToast(\`❌ Save failed\`);
    }
    if (actionType === 'print' || actionType === 'link') {
      try {
        const custWithKey = actionType === 'link' ? await ensurePortalKey(snap.customer) : snap.customer;
        setOutputInvoice(buildOutputInvoicePayload({ invoiceId, invoiceNo, user, snap, isFullCredit, actionType, custWithKey, previousOutstanding: customerBalanceBefore, newOutstanding: customerBalanceAfter }));
      } catch(e3) { console.warn('Output err:', e3); }
    }
    clearForm();
    try { if (typeof syncAll === 'function') syncAll(); } catch(e4) {}
    try { if (typeof triggerLocalDiskBackup === 'function') triggerLocalDiskBackup(); } catch(e5) {}`;

c = c.substring(0, tryIdx) + newCode + c.substring(finalClose + 1);

fs.writeFileSync(f, c, 'utf8');
console.log('✅ Done! handleSaveInvoice now saves to Dexie first, then tries Firestore.');
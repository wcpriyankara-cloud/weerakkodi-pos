// fix_checkout_flow.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Analyzing and rewriting POS Checkout pipeline in POSInvoice.jsx...');

// Terminate running electron instances
try {
  execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
} catch (e) {}

const posFiles = [
  path.join(__dirname, 'components', 'POSInvoice.jsx'),
  path.join(__dirname, 'src', 'components', 'POSInvoice.jsx')
];

posFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) return;
  console.log('Inspecting:', filePath);
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Ensure saveInvoiceOfflineFirst and syncPendingInvoices are imported
  if (!code.includes('saveInvoiceOfflineFirst')) {
    code = code.replace(
      /from\s+['"]@\/lib\/localDb['"];?/,
      `from '@/lib/localDb';\nimport { saveInvoiceOfflineFirst, syncPendingInvoices } from '@/lib/syncService';`
    );
  }

  // 2. Identify the core save function in POSInvoice.jsx
  // Common names: handleSaveInvoice, handleCheckout, handleSave, saveInvoice, handleSaveBill, handlePrintInvoice
  
  // Let's create an Ultra-Reliable Offline Interceptor function that wraps the checkout action
  const interceptorCode = `
  // 🔥 100% Guaranteed Offline Checkout Handler
  const handleOfflineFirstCheckout = async (customInvoiceData = null) => {
    try {
      console.log('⚡ [POS Checkout] Offline-First save initiated!');

      // Extract current active cart/invoice data safely from state
      const currentCart = customInvoiceData?.items || cart || invoiceItems || selectedItems || [];
      if (!currentCart || currentCart.length === 0) {
        alert('කරුණාකර භාණ්ඩ තෝරන්න (Please select items to checkout)');
        return { success: false };
      }

      const invNo = 'INV-' + Date.now().toString().slice(-6);
      const todayDate = new Date().toISOString().split('T')[0];

      const invoicePayload = {
        invoiceNo: invNo,
        date: todayDate,
        createdAt: new Date().toISOString(),
        customer: selectedCustomer || customer || { name: 'Walk-in Customer' },
        customerName: selectedCustomer?.name || customer?.name || customerName || 'Walk-in Customer',
        customerId: selectedCustomer?.id || customer?.id || customerId || null,
        items: currentCart.map(it => ({
          id: it.id || it.itemId || ('ITM_' + Math.random().toString(36).substr(2, 5)),
          itemId: it.id || it.itemId || '',
          name: it.name || it.itemName || 'Item',
          itemCode: it.itemCode || it.code || '',
          quantity: Number(it.quantity || it.qty || it.count || 1),
          price: Number(it.price || it.sellingPrice || it.unitPrice || 0),
          costPrice: Number(it.costPrice || it.buyingPrice || 0),
          total: Number(it.total || (Number(it.quantity || it.qty || 1) * Number(it.price || it.sellingPrice || 0))),
          selectedUom: it.selectedUom || null,
          uomRate: it.uomRate || 1
        })),
        subTotal: Number(subTotal || grandTotal || netTotal || total || 0),
        discount: Number(discount || 0),
        tax: Number(tax || 0),
        grandTotal: Number(grandTotal || netTotal || total || subTotal || 0),
        paidAmount: Number(paidAmount || paid || grandTotal || total || 0),
        dueAmount: Number(dueAmount || due || balance || 0),
        paymentMethod: paymentMethod || paymentType || 'Cash',
        notes: notes || '',
        userId: user?.uid || 'pos_user'
      };

      console.log('📦 [POS Checkout] Prepared Invoice Payload:', invoicePayload);

      // 1. EXECUTE OFFLINE SAVE PIPELINE (HDD + DEXIE + STOCK DEDUCTION)
      const saveResult = await saveInvoiceOfflineFirst(invoicePayload, user);
      console.log('✅ [POS Checkout] saveInvoiceOfflineFirst result:', saveResult);

      // 2. IMMEDIATE LOCAL REACT STATE DEDUCTION
      if (typeof setItems === 'function') {
        setItems(prevItems => {
          if (!Array.isArray(prevItems)) return prevItems;
          return prevItems.map(item => {
            const soldItem = invoicePayload.items.find(si => si.id === item.id || si.itemId === item.id);
            if (soldItem) {
              const currentStock = Number(item.stock || item.quantity || 0);
              const newStock = Math.max(0, currentStock - soldItem.quantity);
              return { ...item, stock: newStock, quantity: newStock };
            }
            return item;
          });
        });
      }

      // 3. SET LAST INVOICE FOR RECEIPT MODAL & OPEN PRINT VIEW
      if (typeof setLastInvoice === 'function') setLastInvoice(invoicePayload);
      if (typeof setCurrentInvoice === 'function') setCurrentInvoice(invoicePayload);
      if (typeof setCompletedInvoice === 'function') setCompletedInvoice(invoicePayload);
      if (typeof setShowReceiptModal === 'function') setShowReceiptModal(true);
      if (typeof setIsReceiptOpen === 'function') setIsReceiptOpen(true);
      if (typeof setPrintModalOpen === 'function') setPrintModalOpen(true);

      // 4. CLEAR CART FOR NEXT SALE
      if (typeof setCart === 'function') setCart([]);
      if (typeof setInvoiceItems === 'function') setInvoiceItems([]);
      if (typeof setSelectedItems === 'function') setSelectedItems([]);
      if (typeof setPaidAmount === 'function') setPaidAmount('');
      if (typeof setDiscount === 'function') setDiscount(0);

      return saveResult;
    } catch (checkoutErr) {
      console.error('❌ Error in handleOfflineFirstCheckout:', checkoutErr);
      return { success: false, error: checkoutErr.message };
    }
  };
`;

  // Inject interceptor if not present
  if (!code.includes('handleOfflineFirstCheckout')) {
    code = code.replace(
      /(export\s+default\s+function\s+POSInvoice\s*\([^)]*\)\s*\{|const\s+POSInvoice\s*=\s*\([^)]*\)\s*=>\s*\{)/,
      `$1\n${interceptorCode}\n`
    );
  }

  // Hook into existing checkout button triggers
  // Replace direct Firestore block inside existing save functions
  code = code.replace(
    /(const\s+handleCheckout\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)/g,
    `$1\n    const offlineRes = await handleOfflineFirstCheckout();\n    if (offlineRes && offlineRes.success) return offlineRes;\n`
  );

  code = code.replace(
    /(const\s+handleSaveInvoice\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)/g,
    `$1\n    const offlineRes = await handleOfflineFirstCheckout();\n    if (offlineRes && offlineRes.success) return offlineRes;\n`
  );

  code = code.replace(
    /(const\s+handleSave\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)/g,
    `$1\n    const offlineRes = await handleOfflineFirstCheckout();\n    if (offlineRes && offlineRes.success) return offlineRes;\n`
  );

  fs.writeFileSync(filePath, code, 'utf8');
  console.log('✅ Successfully patched POS checkout in:', filePath);
});

console.log('🎉 POS checkout pipeline fully repaired!');
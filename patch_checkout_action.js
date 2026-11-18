// patch_checkout_action.js
const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, 'components', 'POSInvoice.jsx'),
  path.join(__dirname, 'src', 'components', 'POSInvoice.jsx')
];

targetFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Inject a top-level universal offline save function into window if needed
  const helperScript = `
  // Immediate Offline Checkout Bridge
  const executeOfflineCheckout = async (invoicePayload) => {
    try {
      console.log('💳 [POS Checkout] Executing offline-first save...', invoicePayload);
      const res = await saveInvoiceOfflineFirst(invoicePayload, user);
      if (res && res.success) {
        console.log('✅ [POS Checkout] Invoice saved successfully offline!', res.invoiceNo);
        // Deduct items in current React state immediately
        if (Array.isArray(invoicePayload.items) && typeof setItems === 'function') {
          setItems(prevItems => {
            if (!Array.isArray(prevItems)) return prevItems;
            return prevItems.map(item => {
              const matched = invoicePayload.items.find(it => (it.id && it.id === item.id) || (it.itemId && it.itemId === item.id));
              if (matched) {
                const qty = Number(matched.quantity || matched.qty || 1);
                const currentStock = Number(item.stock || item.quantity || 0);
                return { ...item, stock: Math.max(0, currentStock - qty), quantity: Math.max(0, currentStock - qty) };
              }
              return item;
            });
          });
        }
      }
      return res;
    } catch (e) {
      console.error('Offline checkout bridge error:', e);
      return { success: false, error: e.message };
    }
  };
`;

  if (!content.includes('executeOfflineCheckout')) {
    content = content.replace(
      /(export\s+default\s+function\s+POSInvoice\s*\([^)]*\)\s*\{|const\s+POSInvoice\s*=\s*\([^)]*\)\s*=>\s*\{)/,
      `$1\n${helperScript}\n`
    );
    fs.writeFileSync(file, content, 'utf8');
    console.log('✅ Injected executeOfflineCheckout into:', file);
  }
});
// components/production/receiptBuilders.js

import { nn, fmt, esc, getPortalLink, partLineNet, partLineGross } from './utils';
import { PAY_OPTIONS } from './constants';
import { T } from './translations';

export function buildReceiptText(entry, invSettings, lang = 'si') {
  const t = T[lang] || T.si;
  const L = [];

  const bizName  = invSettings?.businessName || invSettings?.shopName || entry.businessName || '';
  const bizPhone = invSettings?.phone || '';
  const bizAddr  = invSettings?.address || '';

  L.push(`🧾 *${bizName}*`);
  if (bizAddr)  L.push(`📍 ${bizAddr}`);
  if (bizPhone) L.push(`📞 ${bizPhone}`);
  L.push(`📋 ${entry.batchNumber || entry.invoiceNumber || ''}`);
  L.push('━━━━━━━━━━━━━━━');

  if (entry.customerName)  L.push(`👤 ${entry.customerName}`);
  if (entry.vehicleNumber) L.push(`🚗 ${entry.vehicleNumber}`);
  L.push(`📅 ${entry.date || ''}`);
  if (entry.shift) L.push(`⏰ ${t[entry.shift] || entry.shift}`);
  L.push('');

  entry.outputs?.forEach((o) => {
    if (nn(o.qty) > 0) {
      const up = nn(o.unitPrice);
      const lt = nn(o.qty) * up;
      if (up > 0)
        L.push(`🪨 ${o.product}: ${nn(o.qty)} ${o.unit} × Rs.${fmt(up)} = Rs.${fmt(lt)}`);
      else
        L.push(`🪨 ${o.product}: ${nn(o.qty)} ${o.unit}`);
    }
  });

  entry.serviceItems?.forEach((si) => {
    if (si.name && nn(si.rate) > 0)
      L.push(`🔧 ${si.name}: Rs.${fmt(nn(si.qty) * nn(si.rate))}`);
  });

  entry.partsUsed?.forEach((p) => {
    if (p.name) L.push(`🔩 ${p.name} ×${p.qty}: Rs.${fmt(partLineNet(p))}`);
  });

  entry.harvests?.forEach((h) => {
    if (nn(h.qty) > 0)
      L.push(`🌿 ${h.crop}: ${nn(h.qty)} ${h.unit || 'kg'} × Rs.${fmt(h.pricePerUnit)}`);
  });

  L.push('━━━━━━━━━━━━━━━');
  const total = nn(entry.grandTotal || entry.totalIncome || entry.totalCost || 0);
  L.push(`💰 *Total: Rs.${fmt(total)}*`);

  if (entry.payments?.length) {
    entry.payments.forEach((p) => {
      const pm = PAY_OPTIONS.find((po) => po.key === p.method);
      if (nn(p.amount) > 0)
        L.push(`${pm?.icon || '💵'} ${pm?.label || p.method}: Rs.${fmt(p.amount)}`);
    });
  }

  if (nn(entry.balanceDue) > 0)
    L.push(`❗ *Balance: Rs.${fmt(entry.balanceDue)}*`);

  const prevDebt = nn(entry.previousCustomerBalance || 0);
  const balDue   = nn(entry.balanceDue || 0);

  if (entry.customerName && (prevDebt > 0 || balDue > 0)) {
    L.push('');
    L.push('📊 *ණය සාරාංශය*');
    if (prevDebt > 0) L.push(`  පෙර: Rs.${fmt(prevDebt)}`);
    if (balDue   > 0) L.push(`  මෙම බිල: Rs.${fmt(balDue)}`);
    L.push(`  *මුළු: Rs.${fmt(prevDebt + balDue)}*`);
  }

  if (entry.remark) {
    L.push('');
    L.push(`📝 ${entry.remark}`);
  }

  const portalLink = getPortalLink(entry.customerPortalKey);
  if (portalLink && entry.customerName) {
    L.push('');
    L.push(`👤 ගිණුම: ${portalLink}`);
  }

  L.push('\n🙏 ස්තූතියි!');
  return L.join('\n');
}

export function buildReceiptHTML(entry, invSettings) {
  const bizName  = invSettings?.businessName || invSettings?.shopName || entry.businessName || '';
  const bizPhone = invSettings?.phone || '';
  const bizAddr  = invSettings?.address || '';
  const logo     = invSettings?.logo || '';
  const footer   = invSettings?.footerMessage || 'Thank You!';
  const total    = nn(entry.grandTotal || entry.totalIncome || entry.totalCost || 0);
  const balDue   = nn(entry.balanceDue || 0);
  const prevDebt = nn(entry.previousCustomerBalance || 0);
  const newTotalDebt = prevDebt + balDue;
  const portalLink   = getPortalLink(entry.customerPortalKey || entry.customerId);

  let h = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:80mm;max-width:80mm;margin:0 auto;padding:3mm;font-size:12px;line-height:1.5;color:#000!important;font-weight:bold!important}
div,span,td,th,p{color:#000!important;font-weight:bold!important}
.center{text-align:center}.right{text-align:right}
.line{border-top:1px dashed #000;margin:6px 0}
.dbl-line{border-top:2px solid #000;margin:6px 0}
.row{display:flex;justify-content:space-between;padding:2px 0}
.big{font-size:18px}.xl{font-size:22px}
.sm{font-size:10px}.xs{font-size:9px}
.mt4{margin-top:4px}.mt8{margin-top:8px}.mb4{margin-bottom:4px}
.border-box{border:1px solid #000;padding:6px;margin:6px 0}
.debt-box{border:2px solid #000;padding:8px;margin:8px 0;text-align:center}
.portal-box{border:1px dashed #000;padding:8px;margin:8px 0;text-align:center}
.logo-img{max-height:45px;margin-bottom:4px}
@media print{
  body{width:80mm!important;padding:2mm!important}
  .no-print{display:none!important}
  @page{size:80mm auto;margin:1mm}
}
@media screen{
  body{background:#f8f8f8;padding:16px}
  .print-wrap{background:white;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1);max-width:80mm;margin:0 auto}
}
</style>
</head><body><div class="print-wrap">`;

  if (logo)
    h += `<div class="center"><img src="${esc(logo)}" alt="Logo" class="logo-img"/></div>`;

  h += `<div class="center big">${esc(bizName)}</div>`;
  if (bizAddr)  h += `<div class="center sm">${esc(bizAddr)}</div>`;
  if (bizPhone) h += `<div class="center sm">Tel: ${esc(bizPhone)}</div>`;
  h += `<div class="line"></div>`;
  h += `<div class="row">
    <span>${esc(entry.batchNumber || entry.invoiceNumber || '')}</span>
    <span>${esc(entry.date || '')}</span>
  </div>`;

  const shiftLabel = T.si?.[entry.shift] || entry.shift;
  if (entry.shift)         h += `<div class="sm">⏰ ${esc(shiftLabel)}</div>`;
  if (entry.customerName)  h += `<div class="mt4">👤 ${esc(entry.customerName)}</div>`;
  if (entry.customerPhone) h += `<div class="sm">📱 ${esc(entry.customerPhone)}</div>`;
  if (entry.vehicleNumber) h += `<div>🚗 ${esc(entry.vehicleNumber)}</div>`;
  h += `<div class="line"></div>`;

  // Outputs
  entry.outputs?.forEach((o) => {
    if (nn(o.qty) > 0) {
      const up = nn(o.unitPrice);
      const lt = nn(o.qty) * up;
      if (up > 0)
        h += `<div class="row"><span>🪨 ${esc(o.product)} ${nn(o.qty)} ${esc(o.unit)}</span><span>${fmt(lt)}</span></div>`;
      else
        h += `<div class="row"><span>🪨 ${esc(o.product)}</span><span>${nn(o.qty)} ${esc(o.unit)}</span></div>`;
    }
  });

  // Services
  entry.serviceItems?.forEach((si) => {
    if (si.name && nn(si.rate) > 0) {
      const lt = nn(si.qty) * nn(si.rate);
      h += `<div class="row"><span>🔧 ${esc(si.name)}${nn(si.qty) > 1 ? ' ×' + nn(si.qty) : ''}</span><span>${fmt(lt)}</span></div>`;
    }
  });

  // Parts
  entry.partsUsed?.forEach((p) => {
    if (p.name) {
      h += `<div class="row"><span>🔩 ${esc(p.name)} ×${p.qty}</span><span>${fmt(partLineNet(p))}</span></div>`;
      if (nn(p.discount) > 0)
        h += `<div class="row sm"><span>   Disc ${p.discount}%</span><span>-${fmt(partLineGross(p) * nn(p.discount) / 100)}</span></div>`;
    }
  });

  // Harvests
  entry.harvests?.forEach((hr) => {
    if (nn(hr.qty) > 0) {
      const lv = nn(hr.qty) * nn(hr.pricePerUnit);
      h += `<div class="row"><span>🌿 ${esc(hr.crop)} ${nn(hr.qty)} ${esc(hr.unit || 'kg')}</span><span>${fmt(lv)}</span></div>`;
    }
  });

  // Total
  h += `<div class="dbl-line"></div>`;
  h += `<div class="row"><span class="big">TOTAL</span><span class="xl">Rs.${fmt(total)}</span></div>`;
  h += `<div class="dbl-line"></div>`;

  // Payments
  if (entry.payments?.length) {
    entry.payments.forEach((p) => {
      const pm = PAY_OPTIONS.find((po) => po.key === p.method);
      if (nn(p.amount) > 0)
        h += `<div class="row"><span>${pm?.icon || '💵'} ${pm?.label || p.method}</span><span>Rs.${fmt(p.amount)}</span></div>`;
      else if (p.method === 'credit')
        h += `<div class="row"><span>📌 Credit</span><span>—</span></div>`;
    });
  }

  // Balance
  if (balDue > 0)
    h += `<div class="border-box center"><div class="sm">මෙම බිල ශේෂය</div><div class="xl">Rs.${fmt(balDue)}</div></div>`;
  else if (total > 0)
    h += `<div class="center mt4" style="font-size:14px">✅ PAID IN FULL</div>`;

  // Debt summary
  if (entry.customerName && (prevDebt > 0 || balDue > 0)) {
    h += `<div class="debt-box"><div class="sm mb4">📊 ණය සාරාංශය</div>`;
    if (prevDebt > 0)
      h += `<div class="row"><span>පෙර ණය</span><span>Rs.${fmt(prevDebt)}</span></div>`;
    if (balDue > 0)
      h += `<div class="row"><span>මෙම බිල</span><span>Rs.${fmt(balDue)}</span></div>`;
    h += `<div class="line"></div>`;
    h += `<div class="row"><span class="big">මුළු ණය</span><span class="big">Rs.${fmt(newTotalDebt)}</span></div></div>`;
  }

  // Remark
  if (entry.remark)
    h += `<div class="border-box"><div class="xs">📝 සටහන:</div><div class="sm">${esc(entry.remark)}</div></div>`;

  // Footer
  h += `<div class="center mt8 sm">${esc(footer)}</div>`;

  // Portal link
  if (portalLink && entry.customerName)
    h += `<div class="portal-box"><div class="xs mb4">👤 ඔබේ ගිණුම බලන්න</div><div class="xs" style="word-break:break-all">${esc(portalLink)}</div></div>`;

  // Timestamp
  h += `<div class="center xs mt4">${new Date().toLocaleString('si-LK')}</div>`;

  // Print button
  h += `<div class="no-print" style="text-align:center;margin-top:16px">
<button
  onclick="window.print();setTimeout(()=>window.close(),800)"
  style="padding:14px 36px;background:#000;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:900;cursor:pointer">
  🖨️ PRINT
</button></div>`;

  h += `</div></body></html>`;
  return h;
}
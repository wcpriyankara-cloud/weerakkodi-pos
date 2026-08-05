// components/production/cashSync.js

import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { nn, fmt, todayStr, expLineAmount } from './utils';
import { PAY_TO_CASH, EXP_TO_CASH, EXP_CAT_SI } from './constants';

export const addCashTx = async (uid, p) => {
  if (!uid || nn(p.amount) <= 0) return;
  try {
    await addDoc(collection(db, `users/${uid}/cashTransactions`), {
      type:               p.type || 'out',
      category:           p.category || 'other',
      source:             'production',
      subSource:          p.subSource || p.businessType || '',
      description:        p.description || '',
      amount:             nn(p.amount),
      paymentMethod:      PAY_TO_CASH[p.paymentMethod] || p.paymentMethod || 'cash',
      reference:          p.reference || '',
      isAutomatic:        true,
      date:               p.date || todayStr(),
      timestamp:          Timestamp.now(),
      createdAt:          Timestamp.now(),
      productionEntryId:  p.entryId || '',
      batchNumber:        p.batchNumber || '',
      invoiceNo:          p.invoiceNo || '',
      businessType:       p.businessType || '',
      businessName:       p.businessName || '',
      businessIcon:       p.businessIcon || '🏭',
      customerName:       p.customerName || '',
      customerId:         p.customerId || '',
      customerPhone:      p.customerPhone || '',
      vehicleNo:          p.vehicleNumber || '',
      expenseType:        p.expenseType || '',
      expenseCatSi:       p.expenseCatSi || '',
      shift:              p.shift || '',
      createdBy:          uid,
    });
  } catch (e) {
    console.error('addCashTx:', e);
  }
};

export const syncIncome = async (uid, p) => {
  if (!uid || !p?.payments?.length) return;
  for (const pay of p.payments) {
    if (nn(pay.amount) <= 0 || pay.method === 'credit') continue;
    await addCashTx(uid, {
      type:          'in',
      category:      'productionSales',
      subSource:     p.businessType,
      description:   `${p.businessIcon || '🏭'} ${p.businessName || ''}: ${p.vehicleNumber || p.customerName || 'Cash Sale'}${p.invoiceNo ? ` — ${p.invoiceNo}` : ''}`,
      amount:        nn(pay.amount),
      paymentMethod: pay.method,
      reference:     p.invoiceNo || p.batchNumber || '',
      date:          p.date,
      entryId:       p.entryId,
      batchNumber:   p.batchNumber || '',
      invoiceNo:     p.invoiceNo || '',
      businessType:  p.businessType,
      businessName:  p.businessName || '',
      businessIcon:  p.businessIcon || '🏭',
      customerName:  p.customerName || '',
      customerId:    p.customerId || '',
      customerPhone: p.customerPhone || '',
      vehicleNumber: p.vehicleNumber || '',
      shift:         p.shift || '',
    });
  }
};

export const syncExpenses = async (uid, params) => {
  if (!uid || !params?.expenseItems?.length) return;
  const { entryId, batchNumber, date, businessType, businessName, businessIcon, shift, expenseItems } = params;
  for (const exp of expenseItems) {
    const amt = expLineAmount(exp);
    if (amt <= 0) continue;
    await addCashTx(uid, {
      type:         'out',
      category:     EXP_TO_CASH[exp.category] || 'other',
      subSource:    businessType,
      description:  `📉 ${businessName || ''}: ${exp.description || exp.itemName || EXP_CAT_SI[exp.category] || exp.category || 'Expense'}${nn(exp.qty) > 0 ? ` (${nn(exp.qty)}×Rs.${fmt(exp.unitPrice)})` : ''}`,
      amount:       amt,
      paymentMethod: 'cash',
      reference:    batchNumber || '',
      date,
      entryId,
      batchNumber,
      businessType,
      businessName:  businessName || '',
      businessIcon:  businessIcon || '🏭',
      expenseType:   exp.category || '',
      expenseCatSi:  EXP_CAT_SI[exp.category] || exp.category || '',
      shift:         shift || '',
    });
  }
};

export const syncHarvest = async (uid, params) => {
  if (!uid || !params?.harvests?.length) return;
  const { entryId, batchNumber, date, businessType, businessName, businessIcon, shift, harvests } = params;
  for (const h of harvests) {
    const inc = nn(h.qty) * nn(h.pricePerUnit);
    if (inc <= 0) continue;
    await addCashTx(uid, {
      type:         'in',
      category:     'productionSales',
      subSource:    businessType,
      description:  `🌿 ${businessName || ''}: ${h.crop || 'Harvest'} — ${nn(h.qty)} ${h.unit || 'kg'} × Rs.${fmt(h.pricePerUnit)}`,
      amount:       inc,
      paymentMethod: 'cash',
      reference:    batchNumber || '',
      date,
      entryId,
      batchNumber,
      businessType,
      businessName:  businessName || '',
      businessIcon:  businessIcon || '🌿',
      shift:         shift || '',
    });
  }
};

export const deleteCashSync = async (uid, entryId) => {
  if (!uid || !entryId) return;
  try {
    const snap = await getDocs(
      query(
        collection(db, `users/${uid}/cashTransactions`),
        where('productionEntryId', '==', entryId),
        where('source', '==', 'production')
      )
    );
    await Promise.all(
      snap.docs.map((d) =>
        deleteDoc(doc(db, `users/${uid}/cashTransactions`, d.id))
      )
    );
  } catch (e) {
    console.error('deleteCashSync:', e);
  }
};
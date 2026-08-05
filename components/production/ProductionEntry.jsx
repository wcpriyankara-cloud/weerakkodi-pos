'use client';

// components/production/ProductionEntry.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, getDocs, addDoc, doc, deleteDoc, updateDoc,
  query, where, Timestamp, onSnapshot, increment, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUserAuth } from '../../context/UserContext';
import { T } from './translations';
import { S, responsiveStyles } from './styles';
import {
  BUSINESS_TYPES, DEFAULT_QUARRY_PRODUCTS, DEFAULT_CROP_TYPES,
  SHIFTS, EXPENSE_CATS, PAY_OPTIONS, BIZ_ICONS, BIZ_COLORS,
  QUARRY_OUTPUT_ICONS, CROP_OUTPUT_ICONS,
} from './constants';
import {
  nn, fmt, todayStr, genBatch, genInvoice,
  partLineNet, partLineGross, getDocStock, getBaseUnit,
  formatPhoneWA, expLineAmount,
} from './utils';
import { syncIncome, syncExpenses, syncHarvest, deleteCashSync } from './cashSync';
import { buildReceiptText, buildReceiptHTML } from './receiptBuilders';
import { loadAllEntries, loadAllItems, loadInvoiceSettings } from '../../lib/loaders';
import CustomerPicker from './CustomerPicker';
import ItemPicker from './ItemPicker';
import ServicePicker from './ServicePicker';
import ExpenseNamePicker from './ExpenseNamePicker';
import BillModal from './BillModal';
import HistoryTab from './HistoryTab';
import ShareActions from './ShareActions';
import OutputTypeAddForm from './OutputTypeAddForm';
import StockBadge from './StockBadge';
import FL from './FL';

/* ═══════════════════════════════════════
   SSR-Safe localStorage
   ═══════════════════════════════════════ */
const safeLS = {
  get: (key, fallback = '') => {
    if (typeof window === 'undefined') return fallback;
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  getJSON: (key, fallback) => {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set: (key, value) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      );
    } catch {}
  },
  remove: (key) => {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(key); } catch {}
  },
};

/* ═══════════════════════════════════════
   ★ MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function ProductionEntry({ lang = 'si' }) {
  const t = T[lang] || T.si;
  const { user } = useUserAuth();

  /* ── STATE ── */
  const [businessType,        setBusinessType]        = useState(() => safeLS.get('prod_bizType', ''));
  const [showSelector,        setShowSelector]        = useState(() => !safeLS.get('prod_bizType'));
  const [mainTab,             setMainTab]             = useState('new');
  const [entries,             setEntries]             = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [saving,              setSaving]              = useState(false);
  const [inventoryItems,      setInventoryItems]      = useState([]);
  const [showBill,            setShowBill]            = useState(false);
  const [billData,            setBillData]            = useState(null);
  const [saveMsg,             setSaveMsg]             = useState('');
  const [hasOldData,          setHasOldData]          = useState(false);
  const [oldDataCount,        setOldDataCount]        = useState(0);
  const [migrating,           setMigrating]           = useState(false);
  const [invSettings,         setInvSettings]         = useState(null);
  const [stockControlEnabled, setStockControlEnabled] = useState(
    () => safeLS.getJSON('prod_stock', true)
  );
  const [showProfit,    setShowProfit]    = useState(() => safeLS.getJSON('prod_profit', false));
  const [viewportWidth, setViewportWidth] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const isMobile      = viewportWidth <= 768;
  const isSmallMobile = viewportWidth <= 480;

  const [customBusinesses, setCustomBusinesses] = useState(() => safeLS.getJSON('prod_customBiz', []));
  const [showAddBiz,       setShowAddBiz]       = useState(false);
  const [newBizName,       setNewBizName]       = useState('');
  const [newBizNameEn,     setNewBizNameEn]     = useState('');
  const [newBizIcon,       setNewBizIcon]       = useState('🏢');
  const [newBizColor,      setNewBizColor]      = useState('#64748b');

  const [customOutputTypes, setCustomOutputTypes] = useState([]);
  const [showAddOutput,     setShowAddOutput]     = useState(false);
  const [newOutputName,     setNewOutputName]     = useState('');
  const [newOutputNameEn,   setNewOutputNameEn]   = useState('');
  const [newOutputIcon,     setNewOutputIcon]     = useState('📦');
  const [newOutputUnit,     setNewOutputUnit]     = useState('cube');

  const [entryDate,       setEntryDate]       = useState(todayStr);
  const [shift,           setShift]           = useState('fullDay');
  const [outputs,         setOutputs]         = useState([{ product: 'stone34', qty: '', unit: 'cube', unitPrice: '' }]);
  const [harvests,        setHarvests]        = useState([{ crop: 'tea', qty: '', unit: 'kg', pricePerUnit: '' }]);
  const [custName,        setCustName]        = useState('');
  const [vehNo,           setVehNo]           = useState('');
  const [custData,        setCustData]        = useState(null);
  const [svcItems,        setSvcItems]        = useState([{ name: '', qty: '1', rate: '' }]);
  const [parts,           setParts]           = useState([]);
  const [expenseItems,    setExpenseItems]    = useState([]);
  const [paymentMethod,   setPaymentMethod]   = useState('cash');
  const [payAmount,       setPayAmount]       = useState('');
  const [invoiceRemark,   setInvoiceRemark]   = useState('');
  const [showRemarkInput, setShowRemarkInput] = useState(false);

  const PAY_METHODS = useMemo(() => [
    { key: 'cash',   icon: '💵', label: lang === 'si' ? 'මුදල්' : 'Cash'   },
    { key: 'card',   icon: '💳', label: lang === 'si' ? 'කාඩ්'  : 'Card'   },
    { key: 'bank',   icon: '🏦', label: lang === 'si' ? 'බැංකු' : 'Bank'   },
    { key: 'online', icon: '📱', label: 'Online'                            },
    { key: 'cheque', icon: '📝', label: lang === 'si' ? 'චෙක්'  : 'Cheque' },
    { key: 'credit', icon: '📌', label: lang === 'si' ? 'ණය'   : 'Credit' },
  ], [lang]);

  /* ── DERIVED ── */
  const allBusinessTypes = useMemo(() => {
    const base = { ...BUSINESS_TYPES };
    customBusinesses.forEach((cb) => {
      base[cb.id] = {
        id: cb.id, icon: cb.icon || '🏢', color: cb.color || '#64748b',
        bg: '#f8fafc', si: cb.nameSi || cb.name || cb.id,
        en: cb.nameEn || cb.name || cb.id,
      };
    });
    return base;
  }, [customBusinesses]);

  const isService = useMemo(() => {
    if (['quarry', 'cropFarm'].includes(businessType)) return false;
    return ['vehicleRepair', 'tyreShop', 'vehicleWash', 'custom'].includes(businessType)
      || businessType.startsWith('custom_');
  }, [businessType]);

  const bizName = useMemo(() =>
    allBusinessTypes[businessType]?.[lang] ||
    allBusinessTypes[businessType]?.en || 'Production',
    [businessType, lang, allBusinessTypes]
  );

  const bizIcon = useMemo(() =>
    allBusinessTypes[businessType]?.icon || '🏭',
    [businessType, allBusinessTypes]
  );

  const svcTotal        = useMemo(() => svcItems.reduce((s, i) => s + nn(i.qty) * nn(i.rate), 0), [svcItems]);
  const partsTotal      = useMemo(() => parts.reduce((s, p) => s + partLineNet(p), 0), [parts]);
  const grandTotal      = useMemo(() => svcTotal + partsTotal, [svcTotal, partsTotal]);
  const partsCostTotal  = useMemo(() => parts.reduce((s, p) => s + nn(p.qty) * nn(p.buyPrice), 0), [parts]);
  const estimatedProfit = useMemo(() => grandTotal - partsCostTotal, [grandTotal, partsCostTotal]);

  const effectiveTotal = useMemo(() => {
    if (businessType === 'quarry')
      return outputs.reduce((s, o) => s + nn(o.qty) * nn(o.unitPrice), 0);
    if (businessType === 'cropFarm')
      return harvests.reduce((s, h) => s + nn(h.qty) * nn(h.pricePerUnit), 0);
    return grandTotal;
  }, [businessType, outputs, harvests, grandTotal]);

  const payAmountNum           = nn(payAmount);
  const balanceDue             = Math.max(0, effectiveTotal - payAmountNum);
  const isCredit               = paymentMethod === 'credit';
  const canSaveWithoutCustomer = isCredit ? false : payAmountNum >= effectiveTotal - 0.01;
  const needsCustomerForSave   = !custName.trim() && !canSaveWithoutCustomer && effectiveTotal > 0;

  const getItemStockById = useCallback((itemId) => {
    const item = inventoryItems.find((i) => i.id === itemId);
    return getDocStock(item);
  }, [inventoryItems]);

  const getAvailablePartStock = useCallback((itemId, excludeIndex = -1) => {
    if (!itemId) return 0;
    const total    = getItemStockById(itemId);
    const reserved = parts.reduce((sum, p, idx) =>
      idx === excludeIndex || p.itemId !== itemId ? sum : sum + nn(p.qty), 0);
    return Math.max(0, total - reserved);
  }, [parts, getItemStockById]);

  /* ── EFFECTS ── */
  useEffect(() => {
    const h = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => { safeLS.set('prod_stock',  stockControlEnabled); }, [stockControlEnabled]);
  useEffect(() => { safeLS.set('prod_profit', showProfit);          }, [showProfit]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      collection(db, `users/${user.uid}/customBusinessTypes`),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCustomBusinesses(docs);
        safeLS.set('prod_customBiz', JSON.stringify(docs));
      }, () => {}
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      collection(db, `users/${user.uid}/customOutputTypes`),
      (snap) => {
        setCustomOutputTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, () => {}
    );
    return () => unsub();
  }, [user?.uid]);

  const loadEntries = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const r = await loadAllEntries(user.uid, user.email);
      setEntries(r.entries);
      setHasOldData(r.oldCount > 0);
      setOldDataCount(r.oldCount);
    } catch {} finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    loadEntries();
    loadAllItems(user.uid, user.email).then(setInventoryItems);
    loadInvoiceSettings(user.uid).then((s) => { if (s) setInvSettings(s); });
  }, [user, loadEntries]);

  /* ── BIZ MANAGEMENT ── */
  const handleMigrate = useCallback(async () => {
    if (!user?.uid || migrating) return;
    setMigrating(true);
    try {
      let f = 0;
      for (const d of (await getDocs(collection(db, 'productionEntries'))).docs)
        if (!d.data().uid) {
          await updateDoc(doc(db, 'productionEntries', d.id), { uid: user.uid });
          f++;
        }
      for (const d of (await getDocs(collection(db, 'items'))).docs)
        if (!d.data().uid) await updateDoc(doc(db, 'items', d.id), { uid: user.uid });
      for (const d of (await getDocs(collection(db, 'customers'))).docs)
        if (!d.data().uid) await updateDoc(doc(db, 'customers', d.id), { uid: user.uid });
      alert(`✅ Fixed ${f}`);
      setHasOldData(false); setOldDataCount(0); loadEntries();
    } catch (e) { alert(e.message); } finally { setMigrating(false); }
  }, [user, migrating, loadEntries]);

  const handleAddBusiness = useCallback(async () => {
    if (!newBizName.trim() || !user?.uid) return;
    const bizId = `custom_${Date.now().toString(36)}`;
    try {
      await addDoc(collection(db, `users/${user.uid}/customBusinessTypes`), {
        id: bizId, name: newBizName.trim(), nameSi: newBizName.trim(),
        nameEn: newBizNameEn.trim() || newBizName.trim(),
        icon: newBizIcon || '🏢', color: newBizColor || '#64748b',
        createdAt: Timestamp.now(),
      });
      setNewBizName(''); setNewBizNameEn('');
      setNewBizIcon('🏢'); setNewBizColor('#64748b');
      setShowAddBiz(false);
      setBusinessType(bizId);
      safeLS.set('prod_bizType', bizId);
      setShowSelector(false);
    } catch (e) { alert(e.message); }
  }, [newBizName, newBizNameEn, newBizIcon, newBizColor, user]);

  const handleDeleteBusiness = useCallback(async (bizId) => {
    if (!user?.uid || !window.confirm(t.deleteBiz)) return;
    try {
      const snap  = await getDocs(collection(db, `users/${user.uid}/customBusinessTypes`));
      const found = snap.docs.find((d) => d.data().id === bizId || d.id === bizId);
      if (found) await deleteDoc(doc(db, `users/${user.uid}/customBusinessTypes`, found.id));
      if (businessType === bizId) {
        setBusinessType(''); safeLS.remove('prod_bizType'); setShowSelector(true);
      }
    } catch (e) { alert(e.message); }
  }, [user, t, businessType]);

  const handleAddOutputType = useCallback(async () => {
    if (!newOutputName.trim() || !user?.uid) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/customOutputTypes`), {
        id: `custom_${Date.now().toString(36)}`, businessType,
        label: newOutputNameEn.trim() || newOutputName.trim(),
        labelSi: newOutputName.trim(),
        icon: newOutputIcon || '📦', unit: newOutputUnit || 'cube',
        createdAt: Timestamp.now(),
      });
      setNewOutputName(''); setNewOutputNameEn('');
      setNewOutputIcon('📦'); setNewOutputUnit('cube');
      setShowAddOutput(false);
    } catch (e) { alert(e.message); }
  }, [newOutputName, newOutputNameEn, newOutputIcon, newOutputUnit, user, businessType]);

  const handleDeleteOutputType = useCallback(async (outputId) => {
    if (!user?.uid || !window.confirm(t.deleteOutput)) return;
    try {
      const snap  = await getDocs(collection(db, `users/${user.uid}/customOutputTypes`));
      const found = snap.docs.find((d) => d.data().id === outputId || d.id === outputId);
      if (found) await deleteDoc(doc(db, `users/${user.uid}/customOutputTypes`, found.id));
    } catch (e) { alert(e.message); }
  }, [user, t]);

  const selectBiz = useCallback((ty) => {
    setBusinessType(ty); safeLS.set('prod_bizType', ty); setShowSelector(false);
  }, []);

  const showSaved = useCallback((msg) => {
    setSaveMsg(msg || t.saved);
    setTimeout(() => setSaveMsg(''), 3000);
  }, [t.saved]);

  const resetForm = useCallback(() => {
    setEntryDate(todayStr()); setShift('fullDay');
    setOutputs([{ product: 'stone34', qty: '', unit: 'cube', unitPrice: '' }]);
    setHarvests([{ crop: 'tea', qty: '', unit: 'kg', pricePerUnit: '' }]);
    setCustName(''); setVehNo(''); setCustData(null);
    setSvcItems([{ name: '', qty: '1', rate: '' }]);
    setParts([]); setExpenseItems([]); setShowAddOutput(false);
    setPaymentMethod('cash'); setPayAmount('');
    setInvoiceRemark(''); setShowRemarkInput(false);
  }, []);

  /* ── HELPERS ── */
  const addPart    = useCallback(() => setParts((p) => [...p, { name: '', qty: '1', sellPrice: '', buyPrice: '', discount: '0', image: '' }]), []);
  const removePart = useCallback((i) => setParts((p) => p.filter((_, j) => j !== i)), []);

  const updatePart = useCallback((i, k, v) => {
    setParts((prev) => prev.map((z, j) => {
      if (j !== i) return z;
      if (k === 'qty') {
        if (v === '') return { ...z, qty: '' };
        const wanted = Math.max(0, nn(v));
        if (stockControlEnabled && z.itemId) {
          const ro = prev.reduce((sum, row, idx) =>
            idx === i || row.itemId !== z.itemId ? sum : sum + nn(row.qty), 0);
          const av = Math.max(0, getItemStockById(z.itemId) - ro);
          if (wanted > av) return { ...z, qty: String(av) };
        }
        return { ...z, qty: String(wanted) };
      }
      return { ...z, [k]: v };
    }));
  }, [stockControlEnabled, getItemStockById]);

  const selectPart = useCallback((i, it) => setParts((p) => p.map((z, j) => j === i ? {
    ...z,
    name:      it.name,
    sellPrice: String(it.sellingPriceRetail ?? ''),
    buyPrice:  String(it.buyingPrice ?? ''),
    itemId:    it.id,
    image:     it.picture || it.images?.[0] || '',
    discount:  String(it.retailDiscount ?? '0'),
  } : z)), []);

  const addSvc    = useCallback(() => setSvcItems((p) => [...p, { name: '', qty: '1', rate: '' }]), []);
  const removeSvc = useCallback((i) => setSvcItems((p) => p.filter((_, j) => j !== i)), []);
  const updateSvc = useCallback((i, k, v) => setSvcItems((p) => p.map((z, j) => j === i ? { ...z, [k]: v } : z)), []);

  const addExpItem    = useCallback(() => setExpenseItems((p) => [...p, { category: 'otherExpense', amount: '', qty: '', unitPrice: '', description: '', itemName: '' }]), []);
  const removeExpItem = useCallback((i) => setExpenseItems((p) => p.filter((_, j) => j !== i)), []);
  const updateExpItem = useCallback((i, k, v) => setExpenseItems((p) => p.map((z, j) => j === i ? { ...z, [k]: v } : z)), []);
  const selectExpItem = useCallback((i, it) => setExpenseItems((p) => p.map((z, j) => j === i ? {
    ...z, itemName: it.name,
    unitPrice:   String(it.buyingPrice || it.sellingPriceRetail || ''),
    description: it.name,
  } : z)), []);

  /* ═══════════════════════════════════════
     ★ handleSave
     ═══════════════════════════════════════ */
  const handleSave = useCallback(async (actionType = 'save') => {
    if (saving || !user?.uid) return;
    if (needsCustomerForSave && effectiveTotal > 0) { alert(t.noCustomerWarning); return; }
    setSaving(true);
    try {
      const uid           = user.uid;
      const bn            = genBatch();
      const bIcon         = allBusinessTypes[businessType]?.icon || '🏭';
      const cusId         = custData?.id || '';
      const cusPhone      = custData?.phone || '';
      const cpk           = custData?.portalAccessKey || '';
      const paidAmount    = isCredit ? 0 : Math.min(payAmountNum, effectiveTotal);
      const thisBal       = Math.max(0, effectiveTotal - paidAmount);
      const payStatus     = thisBal <= 0.01 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';
      const paymentRecord = isCredit
        ? [{ method: 'credit', amount: 0 }]
        : paidAmount > 0 ? [{ method: paymentMethod, amount: paidAmount }] : [];

      const base = {
        uid, businessType, businessName: bizName, businessIcon: bIcon,
        date: entryDate, shift, batchNumber: bn,
        createdBy: user.email || uid, createdAt: Timestamp.now(),
        customerId: cusId, customerPhone: cusPhone, customerPortalKey: cpk,
        customerName: custName, vehicleNumber: vehNo,
        payments: paymentRecord, totalPaid: paidAmount, balanceDue: thisBal,
        paymentStatus: payStatus, paymentMethod, remark: invoiceRemark.trim(),
      };

      let invoiceData = null;

      /* QUARRY */
      if (businessType === 'quarry') {
        const quarryIncome = outputs.reduce((s, o) => s + nn(o.qty) * nn(o.unitPrice), 0);
        const data = {
          ...base, outputs,
          totalOutput: outputs.reduce((s, o) => s + nn(o.qty), 0),
          totalCost: 0, totalIncome: quarryIncome, grandTotal: quarryIncome,
        };
        const ref = await addDoc(collection(db, 'productionEntries'), data);
        if (quarryIncome > 0 && paidAmount > 0)
          await syncIncome(uid, {
            entryId: ref.id, batchNumber: bn,
            customerName: custName || 'Cash Sale', customerId: cusId,
            customerPhone: cusPhone, vehicleNumber: vehNo || '',
            businessType, businessName: bizName, businessIcon: bIcon,
            payments: [{ method: paymentMethod, amount: paidAmount }],
            date: entryDate, shift,
          });
        if (cusId) {
          const netChange = quarryIncome - paidAmount;
          if (netChange !== 0)
            try { await updateDoc(doc(db, 'customers', cusId), { currentBalance: increment(netChange), updatedAt: serverTimestamp() }); } catch {}
        }
        invoiceData = { ...data, id: ref.id, totalAmount: quarryIncome };

      /* CROP */
      } else if (businessType === 'cropFarm') {
        const inc  = harvests.reduce((s, h) => s + nn(h.qty) * nn(h.pricePerUnit), 0);
        const data = { ...base, harvests, totalIncome: inc, totalCost: 0, grandTotal: inc };
        const ref  = await addDoc(collection(db, 'productionEntries'), data);
        if (inc > 0 && paidAmount > 0)
          await syncHarvest(uid, {
            entryId: ref.id, batchNumber: bn, date: entryDate, shift,
            businessType, businessName: bizName, businessIcon: bIcon, harvests,
          });
        if (cusId) {
          const netChange = inc - paidAmount;
          if (netChange !== 0)
            try { await updateDoc(doc(db, 'customers', cusId), { currentBalance: increment(netChange), updatedAt: serverTimestamp() }); } catch {}
        }
        invoiceData = { ...data, id: ref.id, totalAmount: inc };

      /* SERVICE */
      } else {
        const existingBalance = nn(custData?.currentBalance);
        const data = {
          ...base, serviceItems: svcItems, partsUsed: parts,
          grandTotal, totalIncome: grandTotal, totalCost: partsCostTotal,
        };
        const ref = await addDoc(collection(db, 'productionEntries'), data);
        if (cusId && grandTotal > 0)
          try { await updateDoc(doc(db, 'customers', cusId), { currentBalance: increment(grandTotal), updatedAt: serverTimestamp() }); } catch {}

        if (actionType === 'bill') {
          setBillData({
            entryId: ref.id, invoiceNo: genInvoice(), batchNumber: bn,
            date: entryDate, shift, businessType, businessName: bizName,
            businessIcon: bIcon, customerName: custName, customerPhone: cusPhone,
            previousCustomerBalance: existingBalance, vehicleNumber: vehNo,
            customerPortalKey: cpk, customerId: cusId,
            serviceItems: svcItems, partsUsed: parts, grandTotal,
            remark: invoiceRemark.trim(),
          });
          setShowBill(true); setSaving(false); return;
        }

        if (paidAmount > 0)
          await syncIncome(uid, {
            entryId: ref.id, invoiceNo: '', batchNumber: bn,
            customerName: custName || 'Cash Sale', customerId: cusId,
            customerPhone: cusPhone, vehicleNumber: vehNo || '',
            businessType, businessName: bizName, businessIcon: bIcon,
            payments: [{ method: paymentMethod, amount: paidAmount }],
            date: entryDate, shift,
          });
        if (cusId && paidAmount > 0)
          try { await updateDoc(doc(db, 'customers', cusId), { currentBalance: increment(-paidAmount), updatedAt: serverTimestamp() }); } catch {}
        invoiceData = { ...data, id: ref.id, totalAmount: grandTotal };
      }

      const finalInvoice = {
        ...invoiceData, batchNumber: bn, businessName: bizName, businessIcon: bizIcon,
        customerName: custName, customerPhone: cusPhone, vehicleNumber: vehNo,
        date: entryDate, shift, payments: paymentRecord, totalPaid: paidAmount,
        balanceDue: thisBal, remark: invoiceRemark.trim(),
        previousCustomerBalance: nn(custData?.currentBalance || 0),
        customerPortalKey: cpk,
      };

      showSaved();

      if (actionType === 'print') {
        const html = buildReceiptHTML(finalInvoice, invSettings);
        const w    = window.open('', '_blank', 'width=350,height=700');
        if (w) { w.document.write(html); w.document.close(); w.focus(); }
      } else if (actionType === 'whatsapp') {
        const msg = buildReceiptText(finalInvoice, invSettings, lang);
        if (cusPhone)
          window.open(`https://wa.me/${formatPhoneWA(cusPhone)}?text=${encodeURIComponent(msg)}`, '_blank');
        else {
          const inp = prompt(lang === 'si' ? 'WhatsApp අංකය:' : 'WhatsApp number:', '07');
          if (inp) window.open(`https://wa.me/${formatPhoneWA(inp.trim())}?text=${encodeURIComponent(msg)}`, '_blank');
        }
      } else if (actionType === 'sms') {
        const msg = buildReceiptText(finalInvoice, invSettings, lang);
        if (cusPhone) window.open(`sms:${cusPhone}?body=${encodeURIComponent(msg)}`, '_self');
        else {
          const inp = prompt(lang === 'si' ? 'SMS අංකය:' : 'SMS number:', '07');
          if (inp) window.open(`sms:${inp.trim()}?body=${encodeURIComponent(msg)}`, '_self');
        }
      }

      resetForm(); setMainTab('today'); await loadEntries();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  }, [
    saving, user, businessType, bizName, bizIcon, allBusinessTypes,
    entryDate, shift, outputs, harvests, custName, vehNo, custData,
    svcItems, parts, grandTotal, partsCostTotal, paymentMethod,
    payAmount, payAmountNum, isCredit, effectiveTotal, needsCustomerForSave,
    invoiceRemark, invSettings, showSaved, resetForm, loadEntries, lang, t,
  ]);

  /* ── handleExpense ── */
  const handleExpense = useCallback(async () => {
    const valid = expenseItems
      .filter((e) => expLineAmount(e) > 0)
      .map((e) => ({ ...e, amount: expLineAmount(e) }));
    if (!valid.length) { alert(t.noExpenses); return; }
    if (!user?.uid) return;
    setSaving(true);
    try {
      const bn    = genBatch();
      const tc    = valid.reduce((s, e) => s + nn(e.amount), 0);
      const bIcon = allBusinessTypes[businessType]?.icon || '🏭';
      const ref   = await addDoc(collection(db, 'productionEntries'), {
        uid: user.uid, businessType, businessName: bizName, businessIcon: bIcon,
        date: entryDate, shift, expenseItems: valid, batchNumber: bn,
        createdAt: Timestamp.now(), createdBy: user.email || user.uid,
        isStandaloneExpense: true, totalCost: tc, totalIncome: 0,
      });
      await syncExpenses(user.uid, {
        entryId: ref.id, batchNumber: bn, date: entryDate, shift,
        businessType, businessName: bizName, businessIcon: bIcon, expenseItems: valid,
      });
      showSaved(); setExpenseItems([]); setMainTab('today'); await loadEntries();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  }, [expenseItems, user, businessType, bizName, allBusinessTypes, entryDate, shift, t, showSaved, loadEntries]);

  /* ── handleDelete ── */
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm(t.deleteConfirm) || !user?.uid) return;
    try {
      const entry = entries.find((e) => e.id === id);
      if (entry && entry.customerId && !entry.isStandaloneExpense) {
        const bd = nn(entry.balanceDue ?? Math.max(0, nn(entry.grandTotal) - nn(entry.totalPaid)));
        if (bd > 0)
          try { await updateDoc(doc(db, 'customers', entry.customerId), { currentBalance: increment(-bd), updatedAt: serverTimestamp() }); } catch {}
      }
      await deleteCashSync(user.uid, id);
      await deleteDoc(doc(db, 'productionEntries', id));
      setEntries((p) => p.filter((e) => e.id !== id));
    } catch (e) { alert(e.message); }
  }, [user, t.deleteConfirm, entries]);

  /* ── TODAY SUMMARIES ── */
  const todayEntries = useMemo(() =>
    entries.filter((e) => e.businessType === businessType && e.date === todayStr()),
    [entries, businessType]
  );
  const bizEntries   = useMemo(() => entries.filter((e) => e.businessType === businessType), [entries, businessType]);
  const todayIncome  = useMemo(() => todayEntries.reduce((s, e) => s + nn(e.totalIncome), 0), [todayEntries]);
  const todayExpense = useMemo(() => todayEntries.reduce((s, e) => s + nn(e.totalCost),   0), [todayEntries]);

  /* ═══════════════════════════════════════
     ★ PAYMENT SECTION
     ═══════════════════════════════════════ */
  const renderPaymentSection = () => {
    if (effectiveTotal <= 0) return null;
    return (
      <div style={{ ...S.card, background: 'linear-gradient(135deg,#f8fafc,#f0f9ff)', border: '2px solid #bfdbfe' }}>

        {/* Grand Total */}
        <div style={{ textAlign: 'center', padding: 14, background: 'white', borderRadius: 12, border: '2px solid #86efac', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t.grandTotal}</div>
          <div style={{ fontSize: isSmallMobile ? 24 : 30, fontWeight: 900, color: '#16a34a' }}>
            Rs.{fmt(effectiveTotal)}
          </div>
          {showProfit && isService && (
            <div style={{ fontSize: 12, fontWeight: 700, color: estimatedProfit >= 0 ? '#16a34a' : '#dc2626', marginTop: 4 }}>
              {t.profit}: {estimatedProfit >= 0 ? '+' : ''}Rs.{fmt(estimatedProfit)}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>
            💳 {t.payMethodLabel}
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PAY_METHODS.map((pm) => (
              <button key={pm.key} type="button"
                onClick={() => {
                  setPaymentMethod(pm.key);
                  if (pm.key === 'credit') setPayAmount('0');
                  else if (!payAmount || payAmount === '0')
                    setPayAmount(effectiveTotal % 1 === 0 ? String(effectiveTotal) : effectiveTotal.toFixed(2));
                }}
                style={{
                  flex: 1, minWidth: isSmallMobile ? 55 : 65,
                  padding: isSmallMobile ? '8px 4px' : '10px 6px',
                  borderRadius: 10, cursor: 'pointer',
                  fontSize: isSmallMobile ? 10 : 12, fontWeight: 700,
                  border: paymentMethod === pm.key ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  background: paymentMethod === pm.key
                    ? (pm.key === 'credit' ? '#fef2f2' : '#eff6ff') : 'white',
                  color: paymentMethod === pm.key
                    ? (pm.key === 'credit' ? '#dc2626' : '#2563eb') : '#64748b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                <span style={{ fontSize: isSmallMobile ? 16 : 20 }}>{pm.icon}</span>
                <span>{pm.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pay Amount */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
            💵 {t.payAmountLabel}
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: isSmallMobile ? 14 : 16, color: isCredit ? '#94a3b8' : '#64748b',
                fontWeight: 700, pointerEvents: 'none',
              }}>Rs.</span>
              <input key="pay-input" type="text" inputMode="decimal" autoComplete="off"
                value={payAmount} disabled={isCredit}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setPayAmount(raw);
                }}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '' || raw === '.') { setPayAmount(''); return; }
                  const num = parseFloat(raw);
                  if (!isNaN(num) && num >= 0)
                    setPayAmount(num % 1 === 0 ? String(num) : num.toFixed(2));
                }}
                onFocus={(e) => {
                  setTimeout(() => {
                    try { e.target.setSelectionRange(0, e.target.value.length); } catch {}
                  }, 50);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: isSmallMobile ? '12px 12px 12px 42px' : '14px 14px 14px 46px',
                  borderRadius: 10,
                  border: isCredit ? '2px solid #e2e8f0' : '2px solid #3b82f6',
                  fontSize: isSmallMobile ? 20 : 24, fontWeight: 900, textAlign: 'right',
                  boxSizing: 'border-box',
                  color: isCredit ? '#94a3b8' : '#1e293b',
                  background: isCredit ? '#f8fafc' : 'white',
                  fontFamily: 'system-ui,monospace', letterSpacing: 1, outline: 'none',
                }}
              />
            </div>
            <button type="button"
              onClick={() => setPayAmount(
                effectiveTotal % 1 === 0 ? String(effectiveTotal) : effectiveTotal.toFixed(2)
              )}
              disabled={isCredit}
              style={{
                padding: isSmallMobile ? '12px 14px' : '14px 18px', borderRadius: 10, border: 'none',
                background: isCredit ? '#e2e8f0' : '#16a34a', color: 'white', fontWeight: 800,
                cursor: isCredit ? 'not-allowed' : 'pointer',
                fontSize: isSmallMobile ? 12 : 14, whiteSpace: 'nowrap',
                minWidth: isSmallMobile ? 60 : 80,
              }}>
              {t.fullPay}
            </button>
          </div>

          {/* Quick amount buttons */}
          {!isCredit && effectiveTotal > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[effectiveTotal,
                Math.ceil(effectiveTotal / 100) * 100,
                Math.ceil(effectiveTotal / 500) * 500,
                Math.ceil(effectiveTotal / 1000) * 1000,
              ]
                .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
                .slice(0, 4)
                .map((v) => {
                  const vs = v % 1 === 0 ? String(v) : v.toFixed(2);
                  return (
                    <button key={v} type="button" onClick={() => setPayAmount(vs)}
                      style={{
                        flex: 1, minWidth: 60, padding: '8px 6px', borderRadius: 8,
                        border: payAmount === vs ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        background: payAmount === vs ? '#eff6ff' : '#f8fafc',
                        color: payAmount === vs ? '#2563eb' : '#475569',
                        fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
                      }}>
                      {fmt(v)}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Balance Due */}
        <div style={{
          padding: 12, borderRadius: 10, textAlign: 'center', marginBottom: 14,
          background: balanceDue <= 0.01 ? '#f0fdf4' : '#fef2f2',
          border: `2px solid ${balanceDue <= 0.01 ? '#86efac' : '#fecaca'}`,
        }}>
          <div style={{ fontSize: 12, color: balanceDue <= 0.01 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {balanceDue <= 0.01 ? t.fullyPaid : t.balanceDueLabel}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: balanceDue <= 0.01 ? '#16a34a' : '#dc2626' }}>
            Rs.{fmt(balanceDue)}
          </div>
        </div>

        {/* Warning */}
        {needsCustomerForSave && (
          <div style={{ padding: 12, background: '#fef3c7', border: '2px solid #fde68a', borderRadius: 10, marginBottom: 14, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#92400e' }}>
            ⚠️ {t.noCustomerWarning}
          </div>
        )}

        {/* Remark */}
        <div style={{ marginBottom: 16 }}>
          {!showRemarkInput ? (
            <button type="button" onClick={() => setShowRemarkInput(true)}
              style={{ background: 'none', border: '1px dashed #94a3b8', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 700, padding: '8px 14px', width: '100%' }}>
              {t.addRemark}
            </button>
          ) : (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                {t.remarkLabel}
              </label>
              <textarea value={invoiceRemark} onChange={(e) => setInvoiceRemark(e.target.value)}
                placeholder={t.remarkPlaceholder} rows={2}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}
        </div>

        {/* Save Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: isSmallMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 8 }}>
          {[
            { action: 'save',     icon: '💾', label: t.save,  bg: '#16a34a' },
            { action: 'print',    icon: '🖨️', label: 'Print', bg: '#2563eb' },
            { action: 'whatsapp', icon: '💬', label: 'WA',    bg: '#25D366' },
            { action: 'sms',      icon: '📱', label: 'SMS',   bg: '#8b5cf6' },
          ].map((btn) => (
            <button key={btn.action} type="button"
              onClick={() => handleSave(btn.action)}
              disabled={saving || needsCustomerForSave}
              style={{
                padding: isSmallMobile ? 12 : 14, borderRadius: 10, border: 'none',
                background: saving || needsCustomerForSave ? '#cbd5e1' : btn.bg,
                color: 'white', fontWeight: 800,
                cursor: saving || needsCustomerForSave ? 'not-allowed' : 'pointer',
                fontSize: isSmallMobile ? 13 : 14,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
              <span style={{ fontSize: 20 }}>{saving ? '⏳' : btn.icon}</span>
              <span>{btn.label}</span>
            </button>
          ))}
        </div>

        {isService && grandTotal > 0 && (
          <button type="button" onClick={() => handleSave('bill')} disabled={saving}
            style={{
              width: '100%', marginTop: 10, padding: 14, borderRadius: 10, border: 'none',
              background: saving ? '#cbd5e1' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
              color: 'white', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15,
            }}>
            🧾 {t.saveThenBill}
          </button>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════
     ★ RENDER
     ═══════════════════════════════════════ */

  if (loading) return (
    <div style={S.center}>
      <div style={S.spinner} />
      <p style={{ color: '#64748b', marginTop: 10 }}>{t.loadingOldData}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (showSelector) return (
    <div style={{ padding: isSmallMobile ? 12 : 20, background: '#f8fafc', minHeight: '100vh' }}>
      <style>{responsiveStyles}</style>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8, fontSize: isSmallMobile ? 20 : 24 }}>
          🏢 {t.selectBusiness}
        </h1>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 30, fontSize: 14 }}>
          {lang === 'si' ? 'ව්‍යාපාර වර්ගය තෝරන්න' : 'Choose type'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${isSmallMobile ? '120px' : '155px'},1fr))`, gap: isSmallMobile ? 10 : 14, marginBottom: 24 }}>
          {Object.values(allBusinessTypes).map((b) => {
            const isC = b.id.startsWith('custom_');
            return (
              <div key={b.id} style={{ position: 'relative' }}>
                <button onClick={() => selectBiz(b.id)}
                  style={{ width: '100%', padding: isSmallMobile ? '18px 10px' : '26px 14px', borderRadius: 20, border: '2px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = b.color; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 20px ${b.color}25`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ fontSize: isSmallMobile ? 36 : 46, lineHeight: 1 }}>{b.icon}</div>
                  <div style={{ fontWeight: 800, color: b.color, fontSize: isSmallMobile ? 11 : 13, textAlign: 'center', lineHeight: 1.3 }}>{b[lang] || b.en}</div>
                </button>
                {isC && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteBusiness(b.id); }}
                    style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          <button onClick={() => setShowAddBiz(true)}
            style={{ padding: isSmallMobile ? '18px 10px' : '26px 14px', borderRadius: 20, border: '3px dashed #3b82f6', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: isSmallMobile ? 36 : 46 }}>➕</div>
            <div style={{ fontWeight: 800, color: '#2563eb', fontSize: isSmallMobile ? 11 : 13 }}>{t.addNewBusiness}</div>
          </button>
        </div>

        {showAddBiz && (
          <div style={{ background: 'white', borderRadius: 20, padding: isSmallMobile ? 20 : 28, border: '2px solid #93c5fd', boxShadow: '0 8px 30px rgba(59,130,246,0.15)', maxWidth: 520, margin: '0 auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: '#1e40af', textAlign: 'center' }}>
              ➕ {t.addNewBusiness}
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8 }}>{t.bizIconLabel}</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BIZ_ICONS.map((icon) => (
                  <button key={icon} onClick={() => setNewBizIcon(icon)}
                    style={{ width: isSmallMobile ? 36 : 44, height: isSmallMobile ? 36 : 44, borderRadius: 10, border: newBizIcon === icon ? '3px solid #3b82f6' : '2px solid #e2e8f0', background: newBizIcon === icon ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: isSmallMobile ? 18 : 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8 }}>{t.bizColorLabel}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BIZ_COLORS.map((color) => (
                  <button key={color} onClick={() => setNewBizColor(color)}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: newBizColor === color ? '3px solid #1e293b' : '2px solid #e2e8f0', background: color, cursor: 'pointer', boxShadow: newBizColor === color ? `0 0 0 3px ${color}40` : 'none' }} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>{t.bizSiName}</label>
              <input value={newBizName} onChange={(e) => setNewBizName(e.target.value)}
                style={{ width: '100%', padding: 14, borderRadius: 12, border: '2px solid #93c5fd', fontSize: 16, fontWeight: 700, boxSizing: 'border-box' }} autoFocus />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>{t.bizEnName}</label>
              <input value={newBizNameEn} onChange={(e) => setNewBizNameEn(e.target.value)} placeholder="English Name"
                style={{ width: '100%', padding: 14, borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 15, boxSizing: 'border-box' }} />
            </div>

            <div style={{ padding: 20, borderRadius: 16, border: `2px solid ${newBizColor}40`, background: `${newBizColor}08`, textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{newBizIcon}</div>
              <div style={{ fontWeight: 800, color: newBizColor, fontSize: 16 }}>{newBizName || '...'}</div>
              {newBizNameEn && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{newBizNameEn}</div>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowAddBiz(false); setNewBizName(''); setNewBizNameEn(''); setNewBizIcon('🏢'); setNewBizColor('#64748b'); }}
                style={{ flex: 1, padding: 14, borderRadius: 12, border: '2px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                {t.cancel}
              </button>
              <button onClick={handleAddBusiness} disabled={!newBizName.trim()}
                style={{ flex: 2, padding: 14, borderRadius: 12, border: 'none', background: !newBizName.trim() ? '#cbd5e1' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: 'white', fontWeight: 800, cursor: !newBizName.trim() ? 'not-allowed' : 'pointer', fontSize: 16 }}>
                {t.addBiz}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const biz = allBusinessTypes[businessType] || BUSINESS_TYPES[businessType];

  /* ── MAIN RETURN ── */
  return (
    <div className="prod-wrap" style={{ ...S.wrap, padding: isSmallMobile ? 8 : isMobile ? 14 : 20 }}>
      <style>{responsiveStyles}</style>

      <BillModal
        show={showBill}
        onClose={() => { setShowBill(false); resetForm(); setMainTab('today'); loadEntries(); }}
        billData={billData} lang={lang} uid={user?.uid}
        onPaymentSaved={loadEntries} invSettings={invSettings}
      />

      {/* HEADER */}
      <div className="prod-header" style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: isSmallMobile ? 28 : 36 }}>{biz?.icon}</div>
          <div>
            <h2 style={{ margin: 0, color: biz?.color, fontSize: isSmallMobile ? 18 : 22 }}>
              {biz?.[lang] || biz?.en}
            </h2>
            {invSettings?.businessName && invSettings.businessName !== bizName && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>🏪 {invSettings.businessName}</div>
            )}
            <button onClick={() => setShowSelector(true)}
              style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: '#3b82f6', padding: 0 }}>
              🔄 Change
            </button>
          </div>
        </div>
        <div className="prod-tabs" style={S.tabs}>
          {[['new', t.newEntry], ['today', t.todaySummary], ['expenses', t.expenseTracking], ['history', t.history]].map(([k, l]) => (
            <button key={k} onClick={() => setMainTab(k)}
              style={{ ...S.tab, ...(mainTab === k ? S.tabOn : {}), fontSize: isSmallMobile ? 11 : 13, padding: isSmallMobile ? '8px 10px' : '10px 16px' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* TOP ACTIONS */}
      <div className="prod-top-actions" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setStockControlEnabled((v) => !v)}
          style={{ padding: isSmallMobile ? '8px 12px' : '10px 14px', borderRadius: 12, border: stockControlEnabled ? '2px solid #16a34a' : '2px solid #f59e0b', background: stockControlEnabled ? '#f0fdf4' : '#fffbeb', color: stockControlEnabled ? '#166534' : '#b45309', fontWeight: 800, cursor: 'pointer', fontSize: isSmallMobile ? 12 : 13 }}>
          {stockControlEnabled ? '🔒 Stock ON' : '🔓 Stock OFF'}
        </button>
        <button onClick={() => setShowProfit((v) => !v)}
          style={{ padding: isSmallMobile ? '8px 12px' : '10px 14px', borderRadius: 12, border: showProfit ? '2px solid #16a34a' : '2px solid #94a3b8', background: showProfit ? '#f0fdf4' : '#f8fafc', color: showProfit ? '#166534' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: isSmallMobile ? 12 : 13 }}>
          {showProfit ? '📈 Profit ON' : '📊 Profit OFF'}
        </button>
      </div>

      {/* OLD DATA */}
      {hasOldData && (
        <div style={{ background: '#fef3c7', border: '2px solid #fcd34d', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14 }}>{t.oldDataFound}</div>
              <div style={{ fontSize: 12, color: '#a16207' }}>{oldDataCount} docs</div>
            </div>
          </div>
          <button onClick={handleMigrate} disabled={migrating}
            style={{ width: '100%', padding: 14, borderRadius: 10, background: migrating ? '#fcd34d' : '#f59e0b', color: 'white', border: 'none', fontWeight: 900, cursor: migrating ? 'not-allowed' : 'pointer', fontSize: 15 }}>
            {migrating ? t.migrating : t.migrateOldData}
          </button>
        </div>
      )}

      {saveMsg && (
        <div style={{ padding: '12px 20px', background: '#dcfce7', color: '#16a34a', borderRadius: 10, fontWeight: 700, marginBottom: 15, textAlign: 'center' }}>
          {saveMsg}
        </div>
      )}

      {/* ═══ NEW ENTRY ═══ */}
      {mainTab === 'new' && (
        <div>
          <div style={S.card}>
            <div className="prod-date-grid" style={S.row2}>
              <FL label={t.date}>
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={S.inp} />
              </FL>
              <FL label={t.shift}>
                <select value={shift} onChange={(e) => setShift(e.target.value)} style={S.inp}>
                  {SHIFTS.map((s) => <option key={s} value={s}>{t[s] || s}</option>)}
                </select>
              </FL>
            </div>
          </div>

          {/* QUARRY */}
          {businessType === 'quarry' && (
            <>
              <div style={S.card}>
                <h3 style={S.cardH}>👤 {t.customerName}</h3>
                <CustomerPicker lang={lang} uid={user?.uid} value={custName} onChange={setCustName} onCustomerData={setCustData} />
                <div style={{ marginTop: 15 }}>
                  <FL label={t.vehicleNumber}>
                    <input value={vehNo} onChange={(e) => setVehNo(e.target.value.toUpperCase())} placeholder="ABC-1234" style={S.inp} />
                  </FL>
                </div>
              </div>

              <div style={S.card}>
                <h3 style={S.cardH}>🪨 {t.outputProducts}</h3>
                {outputs.map((o, i) => {
                  const lineTotal = nn(o.qty) * nn(o.unitPrice);
                  return (
                    <div key={i} style={{ background: '#f8fafc', padding: isSmallMobile ? 12 : 15, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                      <div style={{ marginBottom: 10 }}>
                        <select value={o.product} onChange={(e) => setOutputs((x) => x.map((z, j) => j === i ? { ...z, product: e.target.value } : z))}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}>
                          <optgroup label={lang === 'si' ? 'පෙරනිමි' : 'Default'}>
                            {DEFAULT_QUARRY_PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.icon} {lang === 'si' ? p.labelSi : p.label}</option>)}
                          </optgroup>
                          {customOutputTypes.filter((c) => c.businessType === 'quarry').length > 0 && (
                            <optgroup label={lang === 'si' ? 'අභිරුචි' : 'Custom'}>
                              {customOutputTypes.filter((c) => c.businessType === 'quarry').map((p) => <option key={p.id} value={p.id}>{p.icon} {lang === 'si' ? p.labelSi : p.label}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      <div className="prod-quarry-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1.2fr', gap: 8, alignItems: 'end' }}>
                        <FL label={t.qty}>
                          <input type="text" inputMode="decimal" placeholder="0" value={o.qty}
                            onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setOutputs((x) => x.map((z, j) => j === i ? { ...z, qty: val } : z)); }}
                            onBlur={(e) => { const val = e.target.value.trim(); if (val && !isNaN(parseFloat(val))) { const num = parseFloat(val); setOutputs((x) => x.map((z, j) => j === i ? { ...z, qty: num % 1 === 0 ? String(num) : num.toFixed(2) } : z)); } }}
                            style={{ ...S.inp, fontWeight: 700, textAlign: 'center' }} />
                        </FL>
                        <FL label={t.unit}>
                          <input value={o.unit} placeholder="cube"
                            onChange={(e) => setOutputs((x) => x.map((z, j) => j === i ? { ...z, unit: e.target.value } : z))}
                            style={{ ...S.inp, textAlign: 'center' }} />
                        </FL>
                        <FL label={`${t.unitPrice} (Rs)`}>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 12, fontWeight: 700, pointerEvents: 'none' }}>Rs.</span>
                            <input type="text" inputMode="decimal" placeholder="0.00" value={o.unitPrice}
                              onChange={(e) => { const val = e.target.value; if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setOutputs((x) => x.map((z, j) => j === i ? { ...z, unitPrice: val } : z)); }}
                              onBlur={(e) => { const val = e.target.value.trim(); if (val && !isNaN(parseFloat(val))) { const num = parseFloat(val); setOutputs((x) => x.map((z, j) => j === i ? { ...z, unitPrice: num % 1 === 0 ? String(num) : num.toFixed(2) } : z)); } }}
                              style={{ ...S.inp, fontWeight: 700, textAlign: 'right', paddingLeft: 32 }} />
                          </div>
                        </FL>
                        <div style={{ background: lineTotal > 0 ? '#f0fdf4' : '#f8fafc', padding: '10px 12px', borderRadius: 10, border: `1px solid ${lineTotal > 0 ? '#86efac' : '#e2e8f0'}`, textAlign: 'center', minHeight: 46, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{t.lineTotal}</div>
                          <div style={{ fontWeight: 900, fontSize: lineTotal > 0 ? 16 : 14, color: lineTotal > 0 ? '#16a34a' : '#94a3b8' }}>Rs.{fmt(lineTotal)}</div>
                        </div>
                      </div>

                      {outputs.length > 1 && (
                        <div style={{ textAlign: 'right', marginTop: 8 }}>
                          <button onClick={() => setOutputs((p) => p.filter((_, j) => j !== i))} style={S.delBtn}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setOutputs((p) => [...p, { product: 'stone34', qty: '', unit: 'cube', unitPrice: '' }])} style={{ ...S.addBtn, flex: 1 }}>➕ Add Row</button>
                  <button type="button" onClick={() => setShowAddOutput((v) => !v)} style={{ padding: '12px 16px', borderRadius: 10, border: '1px dashed #f59e0b', background: '#fffbeb', color: '#b45309', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {showAddOutput ? '✕' : '➕'} {t.addOutput}
                  </button>
                </div>

                {showAddOutput && (
                  <OutputTypeAddForm t={t} lang={lang} icons={QUARRY_OUTPUT_ICONS} color="#f59e0b"
                    newOutputName={newOutputName} setNewOutputName={setNewOutputName}
                    newOutputNameEn={newOutputNameEn} setNewOutputNameEn={setNewOutputNameEn}
                    newOutputIcon={newOutputIcon} setNewOutputIcon={setNewOutputIcon}
                    newOutputUnit={newOutputUnit} setNewOutputUnit={setNewOutputUnit}
                    onAdd={handleAddOutputType} onCancel={() => setShowAddOutput(false)}
                    customOutputTypes={customOutputTypes} businessType="quarry"
                    onDelete={handleDeleteOutputType} />
                )}

                {effectiveTotal > 0 && (
                  <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 12, border: '2px solid #86efac', textAlign: 'right', marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ color: '#64748b', fontSize: 13 }}>
                        {t.qty}: {outputs.reduce((s, o) => s + nn(o.qty), 0)} | {t.items}: {outputs.filter((o) => nn(o.qty) > 0).length}
                      </span>
                      <span style={{ fontWeight: 900, fontSize: isSmallMobile ? 18 : 22, color: '#16a34a' }}>
                        {t.grandTotal}: Rs.{fmt(effectiveTotal)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* CROP */}
          {businessType === 'cropFarm' && (
            <>
              <div style={S.card}>
                <h3 style={S.cardH}>👤 {t.customerName}</h3>
                <CustomerPicker lang={lang} uid={user?.uid} value={custName} onChange={setCustName} onCustomerData={setCustData} />
              </div>
              <div style={S.card}>
                <h3 style={S.cardH}>🌿 Harvest</h3>
                {harvests.map((h, i) => (
                  <div key={i} className="prod-harvest-row" style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={h.crop} onChange={(e) => setHarvests((x) => x.map((z, j) => j === i ? { ...z, crop: e.target.value } : z))}
                      style={{ flex: 1.5, minWidth: 120, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}>
                      <optgroup label={lang === 'si' ? 'පෙරනිමි' : 'Default'}>
                        {DEFAULT_CROP_TYPES.map((c) => <option key={c.id} value={c.id}>{c.icon} {lang === 'si' ? c.labelSi : c.label}</option>)}
                      </optgroup>
                      {customOutputTypes.filter((c) => c.businessType === 'cropFarm').length > 0 && (
                        <optgroup label={lang === 'si' ? 'අභිරුචි' : 'Custom'}>
                          {customOutputTypes.filter((c) => c.businessType === 'cropFarm').map((c) => <option key={c.id} value={c.id}>{c.icon} {lang === 'si' ? c.labelSi : c.label}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <input type="number" placeholder={t.qty} value={h.qty} onChange={(e) => setHarvests((x) => x.map((z, j) => j === i ? { ...z, qty: e.target.value } : z))} style={{ flex: 1, minWidth: 60, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontWeight: 700 }} />
                    <input value={h.unit || 'kg'} placeholder={t.unit} onChange={(e) => setHarvests((x) => x.map((z, j) => j === i ? { ...z, unit: e.target.value } : z))} style={{ width: 60, padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input type="number" placeholder="Rs/unit" value={h.pricePerUnit} onChange={(e) => setHarvests((x) => x.map((z, j) => j === i ? { ...z, pricePerUnit: e.target.value } : z))} style={{ flex: 1, minWidth: 80, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontWeight: 700 }} />
                    {nn(h.qty) > 0 && nn(h.pricePerUnit) > 0 && (
                      <div style={{ minWidth: 80, textAlign: 'right', fontWeight: 900, color: '#16a34a', fontSize: 13 }}>
                        Rs.{fmt(nn(h.qty) * nn(h.pricePerUnit))}
                      </div>
                    )}
                    {harvests.length > 1 && <button onClick={() => setHarvests((p) => p.filter((_, j) => j !== i))} style={S.delBtn}>✕</button>}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <button onClick={() => setHarvests((p) => [...p, { crop: 'tea', qty: '', unit: 'kg', pricePerUnit: '' }])} style={{ ...S.addBtn, flex: 1 }}>➕ Add Row</button>
                  <button onClick={() => setShowAddOutput((v) => !v)} style={{ padding: '12px 16px', borderRadius: 10, border: '1px dashed #16a34a', background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {showAddOutput ? '✕' : '➕'} {t.addOutput}
                  </button>
                </div>
                {showAddOutput && (
                  <OutputTypeAddForm t={t} lang={lang} icons={CROP_OUTPUT_ICONS} color="#16a34a"
                    newOutputName={newOutputName} setNewOutputName={setNewOutputName}
                    newOutputNameEn={newOutputNameEn} setNewOutputNameEn={setNewOutputNameEn}
                    newOutputIcon={newOutputIcon} setNewOutputIcon={setNewOutputIcon}
                    newOutputUnit={newOutputUnit} setNewOutputUnit={setNewOutputUnit}
                    onAdd={handleAddOutputType} onCancel={() => setShowAddOutput(false)}
                    customOutputTypes={customOutputTypes} businessType="cropFarm"
                    onDelete={handleDeleteOutputType} />
                )}
              </div>
            </>
          )}

          {/* SERVICE */}
          {isService && (
            <>
              <div style={S.card}>
                <h3 style={S.cardH}>👤 {t.customerName}</h3>
                <CustomerPicker lang={lang} uid={user?.uid} value={custName} onChange={setCustName} onCustomerData={setCustData} />
                <div style={{ marginTop: 15 }}>
                  <FL label={t.vehicleNumber}>
                    <input value={vehNo} onChange={(e) => setVehNo(e.target.value.toUpperCase())} placeholder="ABC-1234" style={S.inp} />
                  </FL>
                </div>
              </div>

              <div style={S.card}>
                <h3 style={S.cardH}>🔩 {t.partsUsed}</h3>
                {parts.map((p, i) => {
                  const g        = partLineGross(p);
                  const dA       = g * (nn(p.discount) / 100);
                  const n2       = g - dA;
                  const lineCost = nn(p.qty) * nn(p.buyPrice);
                  const lineProfit = n2 - lineCost;
                  const selectedItem   = inventoryItems.find((it) => it.id === p.itemId);
                  const totalStock     = selectedItem ? getDocStock(selectedItem) : 0;
                  const availableStock = p.itemId ? getAvailablePartStock(p.itemId, i) : 0;

                  return (
                    <div key={i} style={{ background: '#f8fafc', padding: isSmallMobile ? 12 : 15, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: isSmallMobile ? 8 : 12, alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ width: isSmallMobile ? 48 : 60, height: isSmallMobile ? 48 : 60, background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: isSmallMobile ? 22 : 26 }}>📦</span>}
                        </div>
                        <ItemPicker lang={lang} items={inventoryItems} value={p.name} onChange={(v) => updatePart(i, 'name', v)} onItemSelect={(it) => selectPart(i, it)} stockControlEnabled={stockControlEnabled} />
                        <button onClick={() => removePart(i)} style={S.delBtn}>✕</button>
                      </div>

                      {p.itemId && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                          <StockBadge stock={totalStock} uom={getBaseUnit(selectedItem)} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 6 }}>
                            {t.available}: {availableStock}
                          </span>
                          {stockControlEnabled && availableStock <= 0 && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 6, border: '1px solid #fecaca' }}>
                              ⛔ {t.outOfStock}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="prod-part-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: isSmallMobile ? 8 : 12 }}>
                        <FL label={t.qty}><input type="number" value={p.qty} onChange={(e) => updatePart(i, 'qty', e.target.value)} style={S.inp} /></FL>
                        <FL label={t.discount}><input type="number" value={p.discount} onChange={(e) => updatePart(i, 'discount', e.target.value)} style={S.inp} /></FL>
                        <div style={{ background: 'white', padding: 10, borderRadius: 10, border: '1px solid #eee' }}>
                          <div style={{ fontSize: 10, color: '#64748b' }}>{t.sellPrice}</div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>Rs.{fmt(g)}</div>
                          {dA > 0 && (
                            <>
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>{t.discountAmount}</div>
                              <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 12 }}>-Rs.{fmt(dA)}</div>
                            </>
                          )}
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>{t.netPrice}</div>
                          <div style={{ fontWeight: 800, color: '#16a34a', fontSize: 15 }}>Rs.{fmt(n2)}</div>
                        </div>
                      </div>

                      {showProfit && nn(p.buyPrice) > 0 && (
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: lineProfit >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${lineProfit >= 0 ? '#bbf7d0' : '#fecaca'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>💰 Cost: Rs.{fmt(lineCost)}</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: lineProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                            {t.profit}: {lineProfit >= 0 ? '+' : ''}Rs.{fmt(lineProfit)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button onClick={addPart} style={S.addBtn}>➕ Add Part</button>
              </div>

              <div style={S.card}>
                <h3 style={S.cardH}>🔧 {t.serviceItems}</h3>
                {svcItems.map((si, i) => (
                  <div key={i} className="prod-service-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                    <ServicePicker lang={lang} value={si.name} entries={entries} onChange={(v) => updateSvc(i, 'name', v)} />
                    <input type="number" placeholder="Price" value={si.rate} onChange={(e) => updateSvc(i, 'rate', e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd', minWidth: 70, boxSizing: 'border-box' }} />
                    {svcItems.length > 1 && <button onClick={() => removeSvc(i)} style={S.delBtn}>✕</button>}
                  </div>
                ))}
                <button onClick={addSvc} style={S.addBtn}>➕ Add Service</button>
              </div>
            </>
          )}

          {renderPaymentSection()}
        </div>
      )}

      {/* ═══ EXPENSES ═══ */}
      {mainTab === 'expenses' && (
        <div style={S.card}>
          <h3 style={{ color: '#dc2626', margin: '0 0 15px', fontSize: 18 }}>💸 {t.expenseTracking}</h3>
          {expenseItems.map((exp, i) => {
            const calcAmt = expLineAmount(exp);
            const hasQty  = nn(exp.qty) > 0 && nn(exp.unitPrice) > 0;
            return (
              <div key={i} style={{ background: '#fff', padding: isSmallMobile ? 12 : 15, borderRadius: 12, border: '1px solid #fee2e2', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={exp.category} onChange={(e) => updateExpItem(i, 'category', e.target.value)}
                    style={{ flex: 1, minWidth: 100, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}>
                    {EXPENSE_CATS.map((c) => <option key={c} value={c}>{t[c] || c}</option>)}
                  </select>
                  <div style={{ flex: 2, minWidth: 150 }}>
                    <ItemPicker lang={lang} items={inventoryItems} value={exp.itemName}
                      onChange={(v) => updateExpItem(i, 'itemName', v)}
                      onItemSelect={(it) => selectExpItem(i, it)}
                      stockControlEnabled={stockControlEnabled} />
                  </div>
                  <button onClick={() => removeExpItem(i)} style={S.delBtn}>✕</button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <ExpenseNamePicker lang={lang} value={exp.description} entries={entries} onChange={(v) => updateExpItem(i, 'description', v)} />
                </div>
                <div className="prod-expense-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 10 }}>
                  <FL label={`📦 ${t.expenseQty}`}>
                    <input type="number" value={exp.qty} placeholder="0" onChange={(e) => updateExpItem(i, 'qty', e.target.value)} style={{ ...S.inp, textAlign: 'center', fontWeight: 700 }} />
                  </FL>
                  <FL label={`💰 ${t.expenseUnitPrice}`}>
                    <input type="number" value={exp.unitPrice} placeholder="0.00" onChange={(e) => updateExpItem(i, 'unitPrice', e.target.value)} style={{ ...S.inp, textAlign: 'right', fontWeight: 700 }} />
                  </FL>
                  <div style={{ background: hasQty ? '#f0fdf4' : '#f8fafc', padding: 10, borderRadius: 10, border: `1px solid ${hasQty ? '#86efac' : '#e2e8f0'}` }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{t.expenseAmount}</div>
                    {hasQty ? (
                      <>
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{nn(exp.qty)} × Rs.{fmt(exp.unitPrice)}</div>
                        <div style={{ fontWeight: 900, color: '#dc2626', fontSize: 18, marginTop: 2 }}>Rs.{fmt(calcAmt)}</div>
                      </>
                    ) : (
                      <input type="number" value={exp.amount} placeholder="0.00" onChange={(e) => updateExpItem(i, 'amount', e.target.value)} style={{ ...S.inp, fontWeight: 700, textAlign: 'right', color: '#dc2626', padding: 8, marginTop: 4 }} />
                    )}
                  </div>
                </div>
                {hasQty && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#16a34a', fontWeight: 600, textAlign: 'right' }}>
                    ✅ {nn(exp.qty)} {t.perUnit} Rs.{fmt(exp.unitPrice)} = Rs.{fmt(calcAmt)}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={addExpItem} style={S.addBtn}>➕ {t.addExpense}</button>
          {expenseItems.length > 0 && (
            <div style={{ marginTop: 15, padding: 14, background: '#fef2f2', borderRadius: 10, textAlign: 'right' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{t.totalExpenses}: </span>
              <span style={{ fontWeight: 900, fontSize: 22, color: '#dc2626' }}>
                Rs.{fmt(expenseItems.reduce((s, e) => s + expLineAmount(e), 0))}
              </span>
            </div>
          )}
          <button onClick={handleExpense} disabled={saving}
            style={{ ...S.saveBtn, background: '#dc2626', marginTop: 20, width: '100%' }}>
            {saving ? '⏳' : `💾 ${t.save} Expenses`}
          </button>
        </div>
      )}

      {/* ═══ TODAY ═══ */}
      {mainTab === 'today' && (
        <div>
          <div className="prod-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: isSmallMobile ? 12 : 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t.income}</div>
              <div style={{ fontWeight: 900, color: '#16a34a', fontSize: isSmallMobile ? 16 : 20 }}>Rs.{fmt(todayIncome)}</div>
            </div>
            <div style={{ background: '#fef2f2', borderRadius: 12, padding: isSmallMobile ? 12 : 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t.expense}</div>
              <div style={{ fontWeight: 900, color: '#dc2626', fontSize: isSmallMobile ? 16 : 20 }}>Rs.{fmt(todayExpense)}</div>
            </div>
            <div style={{ background: '#f0f9ff', borderRadius: 12, padding: isSmallMobile ? 12 : 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t.profit}</div>
              <div style={{ fontWeight: 900, color: '#0369a1', fontSize: isSmallMobile ? 16 : 20 }}>Rs.{fmt(todayIncome - todayExpense)}</div>
            </div>
          </div>
          <HistoryTab entries={todayEntries} onDelete={handleDelete} t={t} lang={lang} invSettings={invSettings} />
        </div>
      )}

      {/* ═══ HISTORY ═══ */}
      {mainTab === 'history' && (
        <HistoryTab entries={bizEntries} onDelete={handleDelete} t={t} lang={lang} invSettings={invSettings} />
      )}
    </div>
  );
}
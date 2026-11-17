'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { localDb } from '@/lib/localDb';
import { 
  ArrowLeft, 
  Printer, 
  Receipt, 
  Calendar, 
  User, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  AlertCircle 
} from 'lucide-react';

/* ආරක්ෂිතව දිනයන් Format කිරීම */
const formatDate = (v) => {
  if (!v) return '-';
  try {
    const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString('en-LK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
};

const money = (n) =>
  'Rs. ' + (Number(n) || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qtyFmt = (n) => {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : x.toFixed(3);
};

export default function InvoiceDetailClient(props) {
  const routeParams = useParams();
  const router = useRouter();

  const uid = routeParams?.uid || props?.params?.uid || 'default';
  const invoiceId = routeParams?.invoiceId || props?.params?.invoiceId || 'default';

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!invoiceId || invoiceId === 'default') {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadInvoice() {
      try {
        // 1. පළමුව Local Dexie Database එකෙන් සොයන්න (100% Offline Instant Load)
        let localData = await localDb.invoices.get(invoiceId);
        
        // ID එකෙන් හමු නොවුණහොත් invoiceNo මගින් සොයන්න
        if (!localData) {
          localData = await localDb.invoices.where('invoiceNo').equals(invoiceId).first();
        }

        if (localData && isMounted) {
          setInvoice(localData);
          setLoading(false);
          return;
        }

        // 2. Local එකේ නැතිනම් සහ Online නම් Firebase Firestore එකෙන් ගන්න
        if (navigator.onLine && db) {
          const snap = await getDoc(doc(db, 'invoices', invoiceId));
          if (snap.exists() && isMounted) {
            const firestoreData = { id: snap.id, ...snap.data() };
            setInvoice(firestoreData);
            // ඉදිරි offline භාවිතය සඳහා Dexie එකට Save කර තබන්න
            await localDb.invoices.put(firestoreData).catch(() => {});
          } else if (isMounted) {
            setErrorMsg('මෙම බිල්පත පද්ධතිය තුළ සොයාගත නොහැකි විය.');
          }
        } else if (!localData && isMounted) {
          setErrorMsg('මෙම බිල්පත Local පරිගණකයේ නැත. කරුණාකර Internet සම්බන්ධ කරන්න.');
        }
      } catch (err) {
        console.warn('Error loading invoice detail:', err);
        if (isMounted) {
          setErrorMsg('බිල්පත් විස්තර ලබා ගැනීමේදී දෝෂයක් හටගත්තා.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInvoice();
    return () => { isMounted = false; };
  }, [invoiceId]);

  const handlePrint = () => {
    window.print();
  };

  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const grandTotal = invoice?.grandTotal ?? invoice?.netTotal ?? 0;
  const paidAmount = Number(invoice?.paidAmount ?? invoice?.paid ?? 0);
  const balance = Number(invoice?.balance ?? (grandTotal - paidAmount));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center justify-center font-sans print:bg-white print:p-0">
      
      {/* Top Navigation Bar (Hidden when printing) */}
      <div className="max-w-xl w-full flex items-center justify-between mb-4 print:hidden">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          ආපසු (Back)
        </button>

        {invoice && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl transition-all shadow-lg shadow-blue-600/20 text-sm"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
        )}
      </div>

      {/* Invoice Card Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-xl w-full shadow-2xl print:border-none print:shadow-none print:bg-white print:text-black">
        
        {/* Loading State */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm">බිල්පත් විස්තර ලබාගනිමින් පවතී...</p>
          </div>
        ) : invoice ? (
          <div className="space-y-6">
            
            {/* Invoice Header */}
            <div className="border-b border-slate-800 pb-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 mb-2 print:hidden">
                <Receipt className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white print:text-black">
                WEERAKKODI TRADERS
              </h1>
              <p className="text-xs text-slate-400 print:text-gray-600 mt-0.5">
                Official Sales Receipt / Tax Invoice
              </p>
            </div>

            {/* Meta Information Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 print:bg-gray-50 print:border-gray-200">
              <div>
                <span className="text-slate-400 print:text-gray-500 block">Invoice No:</span>
                <span className="font-bold text-white print:text-black text-sm">{invoice.invoiceNo || invoice.id}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-500 block">Date & Time:</span>
                <span className="font-medium text-slate-200 print:text-gray-800">{formatDate(invoice.date || invoice.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-500 block">Customer:</span>
                <span className="font-semibold text-slate-200 print:text-gray-800">{invoice.customerName || 'Walk-in Customer'}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-500 block">Payment Mode:</span>
                <span className="font-semibold uppercase text-blue-400 print:text-blue-700">{invoice.paymentMethod || 'Cash'}</span>
              </div>
            </div>

            {/* Itemized Table */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 print:text-gray-600 mb-2">
                මිලදී ගත් භාණ්ඩ (Items)
              </div>
              <div className="border border-slate-800 rounded-xl overflow-hidden print:border-gray-300">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/50 text-slate-400 print:bg-gray-100 print:text-black border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">භාණ්ඩය</th>
                      <th className="p-2.5 text-center">ප්‍රමාණය</th>
                      <th className="p-2.5 text-right">මිල</th>
                      <th className="p-2.5 text-right">එකතුව</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-gray-200">
                    {items.map((it, idx) => {
                      const itemPrice = Number(it.price || it.sellingPrice || it.yourPrice || 0);
                      const itemQty = Number(it.qty || it.quantity || 1);
                      const lineTotal = Number(it.lineTotal || (itemPrice * itemQty));
                      return (
                        <tr key={idx} className="hover:bg-slate-800/20">
                          <td className="p-2.5 font-medium text-slate-200 print:text-black">
                            {it.name || it.itemName || 'Item'}
                          </td>
                          <td className="p-2.5 text-center text-slate-300 print:text-gray-700">
                            {qtyFmt(itemQty)} {it.uom && it.uom !== 'unit' ? it.uom : ''}
                          </td>
                          <td className="p-2.5 text-right text-slate-400 print:text-gray-600">
                            {money(itemPrice)}
                          </td>
                          <td className="p-2.5 text-right font-semibold text-slate-100 print:text-black">
                            {money(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="space-y-2 pt-2 border-t border-slate-800 print:border-gray-300">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 print:text-gray-600">මුළු එකතුව (Grand Total):</span>
                <span className="text-lg font-black text-emerald-400 print:text-black">{money(grandTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 print:text-gray-600">ගෙවූ මුදල (Paid Amount):</span>
                <span className="font-semibold text-slate-200 print:text-gray-800">{money(paidAmount)}</span>
              </div>
              {balance > 0 ? (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-dashed border-slate-800">
                  <span className="text-amber-400 font-bold">ඉතිරි ණය මුදල (Due Balance):</span>
                  <span className="font-bold text-amber-400">{money(balance)}</span>
                </div>
              ) : balance < 0 ? (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-dashed border-slate-800">
                  <span className="text-blue-400 font-bold">පාරිභෝගිකයාට ඉතිරි (Change):</span>
                  <span className="font-bold text-blue-400">{money(Math.abs(balance))}</span>
                </div>
              ) : null}
            </div>

            {/* Footer Note */}
            <div className="text-center pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 print:text-gray-500">
              ස්තූතියි! නැවත පැමිණෙන්න. • Thank you for your business!
            </div>

          </div>
        ) : (
          <div className="text-center py-10 space-y-3">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <div className="text-slate-300 font-medium text-sm">
              {errorMsg || 'බිල්පත සොයා ගැනීමට නොහැකි විය.'}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
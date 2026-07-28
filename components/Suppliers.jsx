'use client';

// src/components/Suppliers.jsx
// ═══════════════════════════════════════════════════════════════
// v2.0 — Next.js App Router Compatible + Multi-language via Sidebar
// ═══════════════════════════════════════════════════════════════

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo
} from "react";
import { useRouter } from "next/navigation";
import { db } from "@/shared/firebase-config";
import { useUserAuth } from "@/context/UserContext";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, onSnapshot, query, where,
  Timestamp, runTransaction, serverTimestamp, increment
} from "firebase/firestore";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const MAX_AMT = 10_000_000;
const PURCHASE_COLLECTION = "purchaseInvoices";

const PAY_METHODS = [
  { value: "cash", label: "💵", si: "මුදල්", en: "Cash" },
  { value: "bank", label: "🏦", si: "බැංකු මාරු", en: "Bank Transfer" },
  { value: "cheque", label: "📝", si: "චෙක්පත", en: "Cheque" }
];

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const getSupBal = (s) => {
  if (!s) return 0;
  const b = parseFloat(s.balance);
  if (!isNaN(b) && b !== 0) return b;
  const c = parseFloat(s.currentBalance);
  if (!isNaN(c) && c !== 0) return c;
  return parseFloat(s.openingBalance) || 0;
};

const getTS = (d) => {
  if (!d) return 0;
  if (d.updatedAt?.toDate) return d.updatedAt.toDate().getTime();
  if (d.createdAt?.toDate) return d.createdAt.toDate().getTime();
  if (typeof d.updatedAt === "string") return new Date(d.updatedAt).getTime();
  if (typeof d.createdAt === "string") return new Date(d.createdAt).getTime();
  return 0;
};

const fmtPhone = (p) => {
  if (!p) return null;
  let c = p.replace(/\D/g, "");
  if (c.startsWith("0094")) c = c.slice(2);
  c = c.replace(/^0+/, "");
  if (!c.startsWith("94")) c = "94" + c;
  return (c.length >= 11 && c.length <= 12) ? c : null;
};

const valAmt = (v) => {
  const n = parseFloat(v);
  if (isNaN(n) || v === "") return "Invalid";
  if (n <= 0) return "> 0";
  if (n > MAX_AMT) return `Max Rs.${MAX_AMT.toLocaleString()}`;
  return null;
};

const compress = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      let w = img.width, h = img.height;
      const sc = Math.min(150 / w, 150 / h, 1);
      w = Math.round(w * sc); h = Math.round(h * sc);
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#FFF"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.5));
    };
    img.onerror = () => rej();
    img.src = e.target.result;
  };
  r.onerror = () => rej();
  r.readAsDataURL(file);
});

const pubLink = (id) => {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/public/supplier/${id}`;
};

const fmtCur = (v) => `Rs. ${(parseFloat(v) || 0).toLocaleString("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ═══════════════════════════════════════════════════════════
// REPAIR
// ═══════════════════════════════════════════════════════════
const repairFromPurchaseInvoices = async (userUid) => {
  if (!userUid) { alert("Not logged in"); return; }
  try {
    console.log("🔧 Repair from purchaseInvoices...");
    const suppSnap = await getDocs(query(collection(db, "suppliers"), where("uid", "==", userUid)));
    const invSnap = await getDocs(query(collection(db, PURCHASE_COLLECTION), where("uid", "==", userUid)));
    const balMap = new Map();
    const cntMap = new Map();
    const seen = new Set();
    invSnap.docs.forEach((d) => {
      if (seen.has(d.id)) return; seen.add(d.id);
      const data = d.data();
      const sid = data.supplierId || data.supplier_id || "";
      if (!sid) return;
      const bal = parseFloat(data.balance) || 0;
      balMap.set(sid, (balMap.get(sid) || 0) + bal);
      cntMap.set(sid, (cntMap.get(sid) || 0) + 1);
    });
    let fixed = 0; const rows = [];
    for (const s of suppSnap.docs) {
      const sid = s.id; const sd = s.data();
      const openBal = parseFloat(sd.openingBalance) || 0;
      const invBal = Math.round((balMap.get(sid) || 0) * 100) / 100;
      const correct = Math.round((openBal + invBal) * 100) / 100;
      const cnt = cntMap.get(sid) || 0;
      await updateDoc(doc(db, "suppliers", sid), { balance: correct, currentBalance: correct, invoiceBalance: invBal, lastRepairAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      fixed++;
      rows.push({ Supplier: sd.name || sid, Invoices: cnt, Opening: openBal, InvBalance: invBal, CORRECT: correct });
      console.log(`✅ ${sd.name}: opening=${openBal} + invoices=${invBal} = ${correct} (${cnt} invoices)`);
    }
    console.table(rows);
    alert(`✅ Repair complete!\n\nSuppliers: ${fixed}\nCollection: ${PURCHASE_COLLECTION}\n\nF12 Console බලන්න.`);
  } catch (err) { console.error("❌ Repair failed:", err); alert("❌ Failed: " + err.message); }
};

// ═══════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════
const TT = {
  si: {
    title: "🏭 සැපයුම්කරුවන්", newSup: "+ නව සැපයුම්කරු",
    search: "නම / දුරකථන සොයන්න...", creditOnly: "ණය ඇති අය පමණි",
    image: "පින්තූරය", name: "නම", mobile: "දුරකථන", address: "ලිපිනය",
    balance: "ශේෂය (ණය)", messages: "පණිවිඩ", action: "ක්‍රියාව",
    noData: "සැපයුම්කරුවන් නොමැත", loading: "දත්ත ලබා ගනිමින්...",
    addSup: "සැපයුම්කරු එකතු කරන්න", editSup: "සංස්කරණය",
    supName: "නම *", company: "ආයතනයේ නම", phone: "දුරකථන අංකය",
    email: "ඊමේල්", city: "නගරය", addr: "ලිපිනය", openBal: "ආරම්භක ශේෂය (ණය)",
    save: "සුරකින්න", cancel: "අවලංගු", delete: "මකන්න",
    confirmDel: "මකා දැමීමට අවශ්‍යද?", delWarn: "මෙය අහෝසි කළ නොහැක.",
    pickCon: "📱 දුරකථන නාමාවලියෙන් තෝරන්න", openCon: "විවෘත කරමින්...",
    noPhone: "දුරකථන අංකයක් නොමැත", total: "මුළු ණය මුදල",
    makePay: "මුදල් ගෙවීම", recvPay: "මුදල් ලබා ගැනීම",
    amtPay: "ගෙවන මුදල", amtRecv: "ලැබෙන මුදල",
    payMeth: "ගෙවීම් ක්‍රමය", ref: "යොමු අංකය",
    payNow: "💸 ගෙවන්න", recvNow: "📥 ලබා ගන්න",
    payOK: "✅ ගෙවීම සාර්ථකයි!", recvOK: "✅ ලැබීම සාර්ථකයි!",
    share: "Statement Share", wa: "WhatsApp", sms: "SMS", copy: "Link Copy",
    badPhone: "අංකය වලංගු නැත", noCon: "Contact Picker නැත",
    errSave: "Save දෝෂයකි", errDel: "Delete දෝෂයකි",
    errPay: "ගෙවීමේ දෝෂයකි", errRecv: "ලැබීමේ දෝෂයකි",
    copied: "✅ Copied!", nameReq: "නම අවශ්‍යයි",
    active: "සක්‍රිය", credit: "ණය",
    selBank: "බැංකු ගිණුම තෝරන්න", bankAcc: "බැංකු ගිණුම",
    noBank: "බැංකු ගිණුම් නොමැත.",
    balAfter: "ගෙවීමෙන් පසු ශේෂය", balBefore: "වත්මන් ශේෂය",
    insuf: "ප්‍රමාණවත් නැත",
    bankPayNote: "බැංකු ගෙවීම", bankRecvNote: "බැංකු ලැබීම",
    cash: "💵 මුදල්", bank: "🏦 බැංකු", cheque: "📝 චෙක්පත"
  },
  en: {
    title: "🏭 Suppliers", newSup: "+ New Supplier",
    search: "Search name / phone...", creditOnly: "Credit Only",
    image: "Image", name: "Name", mobile: "Mobile", address: "Address",
    balance: "Balance", messages: "Messages", action: "Action",
    noData: "No Suppliers", loading: "Loading...",
    addSup: "Add Supplier", editSup: "Edit Supplier",
    supName: "Name *", company: "Company", phone: "Phone",
    email: "Email", city: "City", addr: "Address", openBal: "Opening Balance",
    save: "Save", cancel: "Cancel", delete: "Delete",
    confirmDel: "Delete?", delWarn: "Cannot undo.",
    pickCon: "📱 Pick Contact", openCon: "Opening...",
    noPhone: "No phone", total: "Total Credit",
    makePay: "Make Payment", recvPay: "Receive Payment",
    amtPay: "Amount to Pay", amtRecv: "Amount to Receive",
    payMeth: "Payment Method", ref: "Reference",
    payNow: "💸 Pay Now", recvNow: "📥 Receive",
    payOK: "✅ Payment OK!", recvOK: "✅ Receipt OK!",
    share: "Share Statement", wa: "WhatsApp", sms: "SMS", copy: "Copy Link",
    badPhone: "Invalid phone", noCon: "No Contact Picker",
    errSave: "Save error", errDel: "Delete error",
    errPay: "Payment error", errRecv: "Receipt error",
    copied: "✅ Copied!", nameReq: "Name required",
    active: "Active", credit: "Credit",
    selBank: "Select Bank", bankAcc: "Bank Account",
    noBank: "No bank accounts.",
    balAfter: "After payment", balBefore: "Current",
    insuf: "Insufficient",
    bankPayNote: "Bank payment", bankRecvNote: "Bank receipt",
    cash: "💵 Cash", bank: "🏦 Bank", cheque: "📝 Cheque"
  }
};

// ═══════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════
function useLanguage(externalLang) {
  const [lang, setLang] = useState(externalLang || 'si');

  useEffect(() => {
    if (externalLang) { setLang(externalLang); return; }
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'en' || saved === 'si') setLang(saved);
    } catch {}

    const handleLangEvent = (e) => {
      const nl = e.detail || 'si';
      if (nl === 'en' || nl === 'si') setLang(nl);
    };
    const handleStorage = () => {
      try {
        const s = localStorage.getItem('language');
        if (s === 'en' || s === 'si') setLang(s);
      } catch {}
    };

    window.addEventListener('app-language-change', handleLangEvent);
    window.addEventListener('storage', handleStorage);

    const interval = setInterval(() => {
      try {
        const s = localStorage.getItem('language');
        if (s && s !== lang) setLang(s);
      } catch {}
    }, 1000);

    return () => {
      window.removeEventListener('app-language-change', handleLangEvent);
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [externalLang, lang]);

  useEffect(() => {
    if (externalLang) setLang(externalLang);
  }, [externalLang]);

  const t = useMemo(() => TT[lang] || TT.si, [lang]);
  return { lang, t };
}

function useToast() {
  const [toast, setToast] = useState(null);
  const tRef = useRef(null), mRef = useRef(true);
  useEffect(() => { mRef.current = true; return () => { mRef.current = false; if (tRef.current) clearTimeout(tRef.current); }; }, []);
  const show = useCallback((msg, type = "success") => { if (!mRef.current) return; if (tRef.current) clearTimeout(tRef.current); setToast({ msg, type }); tRef.current = setTimeout(() => { if (mRef.current) setToast(null); }, 3500); }, []);
  const hide = useCallback(() => { if (tRef.current) clearTimeout(tRef.current); setToast(null); }, []);
  return { toast, show, hide };
}

function useSuppliers(user) {
  const [suppliers, setSup] = useState([]);
  const [loading, setL] = useState(true);
  const [error, setE] = useState(null);
  useEffect(() => {
    if (!user?.uid) { setL(false); return; }
    const u = onSnapshot(
      query(collection(db, "suppliers"), where("uid", "==", user.uid)),
      (s) => { setSup(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => getTS(b) - getTS(a))); setL(false); setE(null); },
      (e) => { setE(e.message); setL(false); }
    );
    return () => u();
  }, [user?.uid]);
  return { suppliers, loading, error };
}

function useBanks(user) {
  const [banks, setB] = useState([]);
  const [bL, setBL] = useState(true);
  useEffect(() => {
    if (!user?.uid) { setBL(false); return; }
    const u = onSnapshot(
      collection(db, `users/${user.uid}/bankAccounts`),
      (s) => { setB(s.docs.map((d) => ({ id: d.id, ...d.data(), currentBalance: parseFloat(d.data().currentBalance ?? 0) })).filter((a) => a.isActive !== false).sort((a, b) => getTS(b) - getTS(a))); setBL(false); },
      () => setBL(false)
    );
    return () => u();
  }, [user?.uid]);
  return { banks, bL };
}

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
const Toast = memo(({ toast, onClose }) => {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 24px", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 14, maxWidth: 350, boxShadow: "0 8px 24px rgba(0,0,0,.15)", background: toast.type === "success" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#ef4444,#dc2626)", animation: "slideIn .3s ease", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }} onClick={onClose}>
      <span style={{ flex: 1 }}>{toast.msg}</span><span style={{ opacity: .8 }}>✕</span>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// PAYMENT MODAL
// ═══════════════════════════════════════════════════════════
const PayModal = memo(({ show, type, supplier, onClose, onConfirm, busy, banks, bL, t }) => {
  const [amt, setAmt] = useState("");
  const [meth, setMeth] = useState("cash");
  const [ref, setRef] = useState("");
  const [bid, setBid] = useState("");
  const [aErr, setAErr] = useState("");
  const [bErr, setBErr] = useState("");
  const subRef = useRef(false);

  useEffect(() => { if (show) { setAmt(""); setMeth("cash"); setRef(""); setBid(""); setAErr(""); setBErr(""); subRef.current = false; } }, [show]);
  useEffect(() => { if (meth === "bank" && banks.length && !bid) setBid(banks[0].id); if (meth !== "bank") setBid(""); }, [meth, banks, bid]);
  useEffect(() => { setBErr(""); }, [bid, amt]);
  useEffect(() => { if (!show) return; const h = (e) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [show, busy, onClose]);

  const isBank = meth === "bank";
  const isPay = type === "pay";
  const selBank = isBank ? banks.find((b) => b.id === bid) ?? null : null;
  const balAfter = useMemo(() => {
    if (!selBank || !amt || isNaN(parseFloat(amt))) return null;
    return isPay ? selBank.currentBalance - parseFloat(amt) : selBank.currentBalance + parseFloat(amt);
  }, [selBank, amt, isPay]);
  const curBal = getSupBal(supplier);

  const confirm = () => {
    if (subRef.current || busy) return;
    const e = valAmt(amt);
    if (e) { setAErr(e); return; }
    if (isBank) {
      if (!bid) { setBErr(t.selBank); return; }
      if (isPay && selBank && selBank.currentBalance < parseFloat(amt)) { setBErr(t.insuf); return; }
    }
    subRef.current = true;
    onConfirm({
      amount: parseFloat(amt), method: meth, reference: ref,
      bankAccountId: isBank ? bid : null,
      bankAccountName: selBank ? `${selBank.bankName} - ${selBank.accountName}` : null,
    });
  };

  if (!show || !supplier) return null;
  const hc = isPay ? "#16a34a" : "#3b82f6";

  return (
    <div style={SS.overlay} onClick={busy ? undefined : onClose}>
      <div style={{ ...SS.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...SS.mHead, background: hc }}>
          <h3 style={{ margin: 0 }}>{isPay ? "💸" : "📥"} {isPay ? t.makePay : t.recvPay}</h3>
          <button onClick={onClose} disabled={busy} style={SS.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, marginBottom: 18, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#7c3aed", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, overflow: "hidden", flexShrink: 0 }}>
                {supplier.profilePicture ? <img src={supplier.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : supplier.name?.[0]?.toUpperCase()}
              </div>
              <div><div style={{ fontWeight: 700 }}>{supplier.name}</div>{supplier.companyName && <div style={{ fontSize: 12, color: "#64748b" }}>{supplier.companyName}</div>}</div>
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: curBal > 0 ? "#fef2f2" : "#f0fdf4", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>{t.balance}:</span>
              <span style={{ fontWeight: 800, fontSize: 17, color: curBal > 0 ? "#dc2626" : "#16a34a" }}>{fmtCur(curBal)}</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={SS.lbl}>{isPay ? t.amtPay : t.amtRecv} (Rs.) *</label>
            <input type="number" step="0.01" style={{ ...SS.inp, width: "100%", boxSizing: "border-box", fontSize: 22, fontWeight: 800, color: hc, borderColor: aErr ? "#ef4444" : "#e2e8f0", padding: "12px 14px" }} value={amt} onChange={(e) => { setAmt(e.target.value); setAErr(e.target.value ? valAmt(e.target.value) || "" : ""); }} onFocus={(e) => e.target.select()} placeholder="0.00" autoFocus disabled={busy} />
            {aErr && <p style={SS.err}>{aErr}</p>}
            {isPay && curBal > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => { setAmt((curBal / 2).toFixed(2)); setAErr(""); }} disabled={busy} style={{ flex: 1, padding: "6px 0", fontSize: 11, borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer" }}>½ {fmtCur(curBal / 2)}</button>
                <button onClick={() => { setAmt(curBal.toFixed(2)); setAErr(""); }} disabled={busy} style={{ flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "1px solid #16a34a", background: "#dcfce7", color: "#166534", cursor: "pointer" }}>Full {fmtCur(curBal)}</button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={SS.lbl}>{t.payMeth}</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {PAY_METHODS.map((pm) => {
                const s = meth === pm.value;
                const c = pm.value === "cash" ? "#16a34a" : pm.value === "bank" ? "#3b82f6" : "#f59e0b";
                return (
                  <button key={pm.value} onClick={() => { setMeth(pm.value); setBErr(""); }} disabled={busy} style={{ padding: "10px 8px", borderRadius: 10, border: s ? `2px solid ${c}` : "2px solid #e2e8f0", background: s ? `${c}10` : "white", cursor: "pointer", fontWeight: s ? 700 : 500, fontSize: 13, color: s ? c : "#64748b", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 20 }}>{pm.label}</span><span>{t[pm.value] || pm.en}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isBank && (
            <div style={{ marginBottom: 16, padding: 16, background: "#eff6ff", borderRadius: 12, border: "1px solid #bfdbfe" }}>
              <label style={{ ...SS.lbl, color: "#1d4ed8", marginBottom: 8 }}>🏦 {t.bankAcc} *</label>
              {bL ? <div style={{ textAlign: "center", padding: 16, color: "#64748b" }}>⏳</div>
                : !banks.length ? <div style={{ padding: 14, background: "#fef3c7", borderRadius: 8, fontSize: 13, color: "#92400e", textAlign: "center" }}>⚠️ {t.noBank}</div>
                : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                      {banks.map((b) => {
                        const s = bid === b.id;
                        const bl = parseFloat(b.currentBalance || 0);
                        const ins = isPay && parseFloat(amt) > 0 && bl < parseFloat(amt);
                        return (
                          <div key={b.id} onClick={() => { if (!busy) { setBid(b.id); setBErr(""); } }} style={{ padding: "12px 14px", borderRadius: 10, border: s ? "2px solid #3b82f6" : "2px solid #e2e8f0", background: s ? "#dbeafe" : "white", cursor: busy ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: ins ? 0.6 : 1 }}>
                            <div><div style={{ fontWeight: 600, fontSize: 14, color: s ? "#1d4ed8" : "#334155" }}>{s && "✓ "}{b.bankName}</div><div style={{ fontSize: 12, color: "#64748b" }}>{b.accountName}</div></div>
                            <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, fontSize: 15, color: bl >= 0 ? "#16a34a" : "#ef4444" }}>{fmtCur(bl)}</div>{ins && <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>⚠️</div>}</div>
                          </div>
                        );
                      })}
                    </div>
                    {selBank && amt && parseFloat(amt) > 0 && (
                      <div style={{ marginTop: 10, padding: "10px 14px", background: "white", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "#64748b" }}>{t.balBefore}:</span><span style={{ fontSize: 13, fontWeight: 600 }}>{fmtCur(selBank.currentBalance)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, borderTop: "1px dashed #e2e8f0" }}><span style={{ fontSize: 12, color: "#64748b" }}>{t.balAfter}:</span><span style={{ fontSize: 14, fontWeight: 800, color: (balAfter ?? 0) >= 0 ? "#16a34a" : "#ef4444" }}>{fmtCur(balAfter ?? 0)}</span></div>
                      </div>
                    )}
                  </>
                )}
              {bErr && <p style={{ ...SS.err, marginTop: 8 }}>{bErr}</p>}
            </div>
          )}

          <div style={{ marginBottom: 20 }}><label style={SS.lbl}>{t.ref} (Optional)</label><input type="text" style={{ ...SS.inp, width: "100%", boxSizing: "border-box" }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ref / Cheque No" disabled={busy} /></div>

          <button onClick={confirm} disabled={busy || !!aErr || !amt || (isBank && !bid)} style={{ width: "100%", padding: 14, background: hc, color: "white", border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 16, cursor: busy ? "not-allowed" : "pointer", opacity: busy || !amt ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {busy ? <><span className="sp" style={{ width: 18, height: 18, borderWidth: 2 }} /> {t.loading}</> : isPay ? t.payNow : t.recvNow}
          </button>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// SHARE MODAL
// ═══════════════════════════════════════════════════════════
const ShareModal = memo(({ show, supplier, onClose, onWA, onSMS, onCopy, t }) => {
  useEffect(() => { if (!show) return; const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [show, onClose]);
  if (!show || !supplier) return null;
  const bal = getSupBal(supplier);
  return (
    <div style={SS.overlay} onClick={onClose}><div style={{ ...SS.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ ...SS.mHead, background: "#25D366" }}><h3 style={{ margin: 0 }}>📤 {t.share}</h3><button onClick={onClose} style={SS.closeBtn}>✕</button></div>
      <div style={{ padding: 20 }}>
        <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 20, border: "1px solid #bbf7d0" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#166534" }}>{supplier.name}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Balance: <strong style={{ color: bal > 0 ? "#dc2626" : "#16a34a" }}>{fmtCur(Math.abs(bal))}</strong></p>
        </div>
        {[{ fn: onWA, bg: "#25D366", l: `📱 ${t.wa}` }, { fn: onSMS, bg: "#3b82f6", l: `💬 ${t.sms}` }, { fn: onCopy, bg: "#7c3aed", l: `🔗 ${t.copy}` }].map(({ fn, bg, l }) => (
          <button key={l} onClick={fn} style={{ width: "100%", padding: 15, marginBottom: 10, background: bg, color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", fontSize: 15 }}>{l}</button>
        ))}
        <div style={{ marginTop: 12, padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 11, color: "#7c3aed", fontFamily: "monospace", wordBreak: "break-all" }}>{pubLink(supplier.id)}</div>
      </div>
    </div></div>
  );
});

// ═══════════════════════════════════════════════════════════
// SUPPLIER ROW
// ═══════════════════════════════════════════════════════════
const SupRow = memo(({ sup, idx, t, onNav, onShare, onSMS, onRecv, onPay, onEdit, onDel }) => {
  const bal = getSupBal(sup);
  return (
    <tr style={{ backgroundColor: idx % 2 === 0 ? "white" : "#faf5ff" }}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f5f3ff")}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "white" : "#faf5ff")}>
      <td style={SS.td}>{idx + 1}</td>
      <td style={SS.td}>
        <div style={SS.avatar}>
          {sup.profilePicture
            ? <img src={sup.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
            : <span style={{ fontSize: 14, fontWeight: 700 }}>{sup.name?.[0]?.toUpperCase() ?? "?"}</span>}
        </div>
      </td>
      <td style={SS.td}>
        <div onClick={() => onNav(sup.id)} style={{ fontWeight: 600, color: "#7c3aed", cursor: "pointer" }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onNav(sup.id); }}>
          {sup.name}
        </div>
        {sup.companyName && <div style={{ fontSize: 11, color: "#64748b" }}>{sup.companyName}</div>}
      </td>
      <td style={SS.td}>{sup.phone ? <a href={`tel:${sup.phone}`} style={{ color: "#334155", textDecoration: "none" }}>{sup.phone}</a> : "-"}</td>
      <td style={SS.td} className="hm">{sup.city || sup.address || "-"}</td>
      <td style={{ ...SS.td, textAlign: "right", fontWeight: "bold", color: bal > 0 ? "#dc2626" : "#16a34a", fontVariantNumeric: "tabular-nums" }}>{fmtCur(bal)}</td>
      <td style={{ ...SS.td, textAlign: "center" }}>
        <button onClick={() => onShare(sup)} style={{ ...SS.iBtn, background: "#25D366" }}>📤</button>
        <button onClick={() => onSMS(sup)} style={{ ...SS.iBtn, background: "#3b82f6" }}>📩</button>
      </td>
      <td style={{ ...SS.td, textAlign: "center" }}>
        <button onClick={() => onRecv(sup)} style={{ ...SS.aBtn, background: "#dbeafe", borderColor: "#60a5fa", marginRight: 4 }}>📥</button>
        <button onClick={() => onPay(sup)} style={{ ...SS.aBtn, background: "#dcfce7", borderColor: "#86efac", marginRight: 4 }}>💸</button>
        <button onClick={() => onEdit(sup)} style={{ ...SS.aBtn, marginRight: 4 }}>✏️</button>
        <button onClick={() => onDel(sup.id)} style={{ ...SS.aBtn, background: "#fef2f2", borderColor: "#fecaca", color: "red" }}>🗑️</button>
      </td>
    </tr>
  );
}, (p, n) => p.sup.id === n.sup.id && p.sup.balance === n.sup.balance && p.sup.currentBalance === n.sup.currentBalance && p.sup.name === n.sup.name && p.sup.updatedAt === n.sup.updatedAt && p.idx === n.idx);

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function Suppliers({ lang: externalLang }) {
  const router = useRouter();
  const fRef = useRef(null);
  const { user } = useUserAuth();
  const { lang, t } = useLanguage(externalLang);
  const { toast, show: showToast, hide: hideToast } = useToast();
  const { suppliers, loading, error } = useSuppliers(user);
  const { banks, bL } = useBanks(user);

  const [srch, setSrch] = useState("");
  const [credOnly, setCredOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [delId, setDelId] = useState(null);
  const [payMod, setPayMod] = useState({ show: false, type: "pay", sup: null });
  const [busy, setBusy] = useState(false);
  const [shareMod, setShareMod] = useState({ show: false, sup: null });
  const savRef = useRef(false);

  const [form, setForm] = useState({ id: null, name: "", companyName: "", phone: "", email: "", address: "", city: "", openingBalance: "", balance: 0, profilePicture: "" });
  const [fSaving, setFSaving] = useState(false);
  const [conLoad, setConLoad] = useState(false);
  const [fErr, setFErr] = useState({});

  const filtered = useMemo(() => {
    const lo = srch.toLowerCase().trim();
    return suppliers.filter((s) => {
      const m = (s.name || "").toLowerCase().includes(lo) || (s.phone || "").includes(srch.trim()) || (s.companyName || "").toLowerCase().includes(lo);
      return m && (!credOnly || getSupBal(s) > 0);
    });
  }, [suppliers, srch, credOnly]);

  const totalBal = useMemo(() => filtered.reduce((s, sup) => s + getSupBal(sup), 0), [filtered]);
  const stats = useMemo(() => ({ total: filtered.length, credit: filtered.filter((s) => getSupBal(s) > 0).length }), [filtered]);

  const openForm = useCallback((sup = null) => {
    setFErr({});
    if (sup) { setForm({ ...sup, openingBalance: sup.openingBalance ?? "" }); setIsEdit(true); }
    else { setForm({ id: null, name: "", companyName: "", phone: "", email: "", address: "", city: "", openingBalance: "", balance: 0, profilePicture: "" }); setIsEdit(false); }
    setShowForm(true);
  }, []);

  const uploadImg = useCallback(async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) { showToast("Image file", "error"); return; }
    if (f.size > 5e6) { showToast("Max 5MB", "error"); return; }
    try { const c = await compress(f); setForm((p) => ({ ...p, profilePicture: c })); }
    catch { showToast("Upload fail", "error"); }
    if (fRef.current) fRef.current.value = "";
  }, [showToast]);

  const pickCon = useCallback(async () => {
    if (!("contacts" in navigator && "ContactsManager" in window)) { showToast(t.noCon, "error"); return; }
    try { setConLoad(true); const cs = await navigator.contacts.select(["name", "tel", "email"], { multiple: false }); if (cs.length) { const c = cs[0]; setForm((p) => ({ ...p, name: c.name?.[0] ?? p.name, phone: c.tel?.[0] ?? p.phone, email: c.email?.[0] ?? p.email })); } }
    catch {} finally { setConLoad(false); }
  }, [t.noCon, showToast]);

  const doSave = useCallback(async (e) => {
    e?.preventDefault(); if (savRef.current) return;
    if (!form.name.trim()) { setFErr({ name: t.nameReq }); return; }
    savRef.current = true; setFSaving(true);
    try {
      const now = new Date().toISOString();
      const p = { name: form.name.trim(), companyName: form.companyName?.trim() || "", phone: form.phone?.trim() || "", email: form.email?.trim() || "", address: form.address?.trim() || "", city: form.city?.trim() || "", profilePicture: form.profilePicture || "", uid: user.uid, updatedAt: now };
      if (isEdit) { await updateDoc(doc(db, "suppliers", form.id), p); }
      else { const ob = parseFloat(form.openingBalance) || 0; await addDoc(collection(db, "suppliers"), { ...p, openingBalance: ob, balance: ob, currentBalance: ob, createdAt: now }); }
      showToast(t.save + " ✅"); setShowForm(false);
    } catch (err) { showToast(t.errSave + ": " + err.message, "error"); }
    finally { setFSaving(false); savRef.current = false; }
  }, [form, isEdit, user, t, showToast]);

  const doDel = useCallback(async () => {
    if (!delId) return;
    try { await deleteDoc(doc(db, "suppliers", delId)); showToast(t.delete + " ✅"); }
    catch { showToast(t.errDel, "error"); }
    finally { setShowDel(false); setDelId(null); }
  }, [delId, showToast, t]);

  const openPay = useCallback((sup, type) => setPayMod({ show: true, type, sup }), []);
  const closePay = useCallback(() => { if (!busy) setPayMod({ show: false, type: "pay", sup: null }); }, [busy]);

  const handlePay = useCallback(async ({ amount, method, reference, bankAccountId, bankAccountName }) => {
    const { type, sup } = payMod; if (!sup || busy) return;
    setBusy(true); const isPay = type === "pay"; const isBank = method === "bank" && !!bankAccountId;
    try {
      const supRef = doc(db, "suppliers", sup.id);
      await runTransaction(db, async (tx) => {
        const ss = await tx.get(supRef); if (!ss.exists()) throw new Error("Not found");
        let bRef = null, bs = null;
        if (isBank) { bRef = doc(db, `users/${user.uid}/bankAccounts`, bankAccountId); bs = await tx.get(bRef); if (!bs.exists()) throw new Error("Bank not found"); }
        const sd = ss.data(); const cur = parseFloat(sd.balance) || parseFloat(sd.currentBalance) || 0;
        const newB = isPay ? cur - amount : cur + amount;
        let nBB = null;
        if (isBank) { const bBal = parseFloat(bs.data().currentBalance || 0); if (isPay && bBal < amount) throw new Error("INSUF"); nBB = isPay ? bBal - amount : bBal + amount; }
        tx.update(supRef, { balance: newB, currentBalance: newB, updatedAt: new Date().toISOString() });
        if (isBank && bRef) tx.update(bRef, { currentBalance: nBB, updatedAt: serverTimestamp() });
      });

      const now = new Date(); const ds = now.toISOString().split("T")[0];
      try {
        await addDoc(collection(db, `users/${user.uid}/cashTransactions`), {
          type: isPay ? "out" : "in", category: isPay ? "supplierPayment" : "supplierReceipt",
          description: isPay ? `${sup.name} ගෙවීම` : `${sup.name} ලැබීම`,
          amount, paymentMethod: method, timestamp: Timestamp.now(), date: ds, source: "supplier",
          isAutomatic: true, supplierId: sup.id, supplier_id: sup.id, supplierName: sup.name || "",
          reference: reference || "", createdAt: Timestamp.now(), createdBy: user.email || "",
          ...(isBank ? { bankAccountId, bankAccountName: bankAccountName || "" } : {}),
        });
      } catch {}

      if (isBank) {
        try {
          await addDoc(collection(db, `users/${user.uid}/bankTransactions`), {
            type: isPay ? "withdrawal" : "deposit", accountId: bankAccountId, amount,
            date: Timestamp.fromDate(now), reference: reference || "",
            description: `${isPay ? t.bankPayNote : t.bankRecvNote} - ${sup.name}`,
            supplierId: sup.id, source: "supplier", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        } catch {}
      }

      showToast(isPay ? t.payOK : t.recvOK);
      setPayMod({ show: false, type: "pay", sup: null });
    } catch (err) {
      showToast(err.message === "INSUF" ? t.insuf : (isPay ? t.errPay : t.errRecv) + ": " + err.message, "error");
    } finally { setBusy(false); }
  }, [payMod, busy, user, t, showToast]);

  const openShare = useCallback((s) => setShareMod({ show: true, sup: s }), []);
  const closeShare = useCallback(() => setShareMod({ show: false, sup: null }), []);

  const doWA = useCallback(() => {
    const s = shareMod.sup; if (!s) return;
    if (!s.phone) { showToast(t.noPhone, "error"); return; }
    const p = fmtPhone(s.phone); if (!p) { showToast(t.badPhone, "error"); return; }
    const b = Math.abs(getSupBal(s));
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(`ආයුබෝවන් ${s.name},\nශේෂය: Rs.${b.toLocaleString()}\n${pubLink(s.id)}`)}`, "_blank");
    closeShare();
  }, [shareMod.sup, t, showToast, closeShare]);

  const doSMS = useCallback((sup) => {
    const s = sup || shareMod.sup; if (!s) return;
    if (!s.phone) { showToast(t.noPhone, "error"); return; }
    const b = Math.abs(getSupBal(s)); const ph = s.phone.replace(/\D/g, "");
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.open(ios ? `sms:${ph}&body=${encodeURIComponent(`Balance: Rs.${b.toLocaleString()}. ${pubLink(s.id)}`)}` : `sms:${ph}?body=${encodeURIComponent(`Balance: Rs.${b.toLocaleString()}. ${pubLink(s.id)}`)}`, "_blank");
    closeShare();
  }, [shareMod.sup, t, showToast, closeShare]);

  const doCopy = useCallback(async () => {
    const s = shareMod.sup; if (!s) return;
    const l = pubLink(s.id);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(l);
      else { const ta = document.createElement("textarea"); ta.value = l; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
      showToast(t.copied); closeShare();
    } catch { showToast(l, "error"); }
  }, [shareMod.sup, showToast, closeShare, t]);

  // Navigate to supplier detail
  const navigateToSupplier = useCallback((id) => {
    router.push(`/suppliers/${id}`);
  }, [router]);

  if (error) return (
    <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
      <div style={{ fontSize: 48 }}>⚠️</div><h3>Error</h3><p>{error}</p>
      <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "#7c3aed", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}>Retry</button>
    </div>
  );

  return (
    <div style={SS.wrap}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}.sp{border:3px solid rgba(0,0,0,.1);border-left-color:#7c3aed;border-radius:50%;display:inline-block;vertical-align:middle;margin-right:8px;animation:spin .8s linear infinite}@media(max-width:768px){.hm{display:none!important}}`}</style>
      <Toast toast={toast} onClose={hideToast} />

      <div style={SS.header}>
        <div>
          <h1 style={SS.title}>{t.title}</h1>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{t.active}: {stats.total} | {t.credit}: {stats.credit}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => { if (window.confirm("purchaseInvoices → supplier balances restore?")) repairFromPurchaseInvoices(user?.uid); }} style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", padding: "10px 14px", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: "bold", fontSize: 12 }}>🔧 Fix Balances</button>
          <button onClick={() => openForm()} style={SS.addBtn}>{t.newSup}</button>
        </div>
      </div>

      <div style={SS.fBar}>
        <input type="text" placeholder={t.search} style={SS.sInp} value={srch} onChange={(e) => setSrch(e.target.value)} />
        <label style={SS.chk}><input type="checkbox" checked={credOnly} onChange={(e) => setCredOnly(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} /><span>{t.creditOnly}</span></label>
        <div style={SS.totBox}><span style={{ color: "#64748b", fontSize: 12 }}>{t.total}:</span><span style={{ fontWeight: "bold", fontSize: 16, color: totalBal > 0 ? "#dc2626" : "#16a34a" }}> {fmtCur(totalBal)}</span></div>
      </div>

      <div style={SS.tWrap}><div style={{ overflowX: "auto" }}>
        <table style={SS.table}>
          <thead>
            <tr>
              <th style={{ ...SS.th, width: 40 }}>#</th>
              <th style={{ ...SS.th, width: 50 }}>{t.image}</th>
              <th style={SS.th}>{t.name}</th>
              <th style={SS.th}>{t.mobile}</th>
              <th style={SS.th} className="hm">{t.address}</th>
              <th style={{ ...SS.th, textAlign: "right" }}>{t.balance}</th>
              <th style={{ ...SS.th, textAlign: "center" }}>{t.messages}</th>
              <th style={{ ...SS.th, textAlign: "center" }}>{t.action}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ ...SS.td, textAlign: "center", padding: 50 }}><span className="sp" style={{ width: 20, height: 20 }} /> {t.loading}</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan="8" style={{ ...SS.td, textAlign: "center", padding: 50, color: "#94a3b8" }}>
                <div style={{ fontSize: 48, opacity: .4, marginBottom: 8 }}>🏭</div>
                <div>{t.noData}</div>
                {srch && <button onClick={() => setSrch("")} style={{ marginTop: 12, padding: "6px 16px", background: "#7c3aed", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>Clear</button>}
              </td></tr>
            ) : filtered.map((sup, i) => (
              <SupRow key={sup.id} sup={sup} idx={i} t={t}
                onNav={navigateToSupplier}
                onShare={openShare} onSMS={doSMS}
                onRecv={(s) => openPay(s, "receive")}
                onPay={(s) => openPay(s, "pay")}
                onEdit={openForm}
                onDel={(id) => { setDelId(id); setShowDel(true); }}
              />
            ))}
          </tbody>
        </table>
      </div></div>

      <PayModal show={payMod.show} type={payMod.type} supplier={payMod.sup} onClose={closePay} onConfirm={handlePay} busy={busy} banks={banks} bL={bL} t={t} />
      <ShareModal show={shareMod.show} supplier={shareMod.sup} onClose={closeShare} onWA={doWA} onSMS={() => doSMS(shareMod.sup)} onCopy={doCopy} t={t} />

      {showForm && (
        <div style={SS.overlay} onClick={fSaving ? undefined : () => setShowForm(false)}>
          <div style={SS.modal} onClick={(e) => e.stopPropagation()}>
            <div style={SS.mHead}><h3 style={{ margin: 0 }}>{isEdit ? t.editSup : t.addSup}</h3><button onClick={() => setShowForm(false)} style={SS.closeBtn} disabled={fSaving}>✕</button></div>
            <div style={{ padding: 20 }}>
              <div style={{ textAlign: "center", marginBottom: 15 }}>
                <div onClick={() => fRef.current?.click()} style={SS.avatarUp}>
                  {form.profilePicture ? <img src={form.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 30 }}>📷</span>}
                </div>
                {form.profilePicture && <button onClick={() => setForm((p) => ({ ...p, profilePicture: "" }))} style={{ marginTop: 6, fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>Remove</button>}
                <input ref={fRef} type="file" accept="image/*" onChange={uploadImg} hidden />
              </div>
              {!isEdit && <button onClick={pickCon} style={SS.conBtn} disabled={conLoad}>{conLoad ? t.openCon : t.pickCon}</button>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                <div>
                  <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box", borderColor: fErr.name ? "#ef4444" : "#e2e8f0" }} placeholder={t.supName} value={form.name} onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFErr((p) => ({ ...p, name: "" })); }} autoFocus={!isEdit} />
                  {fErr.name && <p style={SS.err}>{fErr.name}</p>}
                </div>
                <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box" }} placeholder={t.phone} type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box" }} placeholder={t.company} value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
                <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box" }} placeholder={t.email} type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box", gridColumn: "1/-1" }} placeholder={t.addr} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box" }} placeholder={t.city} value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
                {!isEdit && <input style={{ ...SS.inp, width: "100%", boxSizing: "border-box" }} type="number" placeholder={t.openBal} value={form.openingBalance} onChange={(e) => setForm((p) => ({ ...p, openingBalance: e.target.value }))} min="0" step="0.01" />}
              </div>
            </div>
            <div style={SS.mFoot}>
              <button onClick={() => setShowForm(false)} style={SS.canBtn} disabled={fSaving}>{t.cancel}</button>
              <button onClick={doSave} disabled={fSaving} style={{ ...SS.saveBtn, opacity: fSaving ? 0.7 : 1 }}>
                {fSaving ? <><span className="sp" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} />{t.loading}</> : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDel && (
        <div style={SS.overlay} onClick={() => setShowDel(false)}>
          <div style={{ background: "white", padding: 30, borderRadius: 16, textAlign: "center", width: 320, boxShadow: "0 20px 40px rgba(0,0,0,.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px" }}>{t.confirmDel}</h3>
            <p style={{ color: "#666", fontSize: 13 }}>{t.delWarn}</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowDel(false)} style={SS.canBtn}>{t.cancel}</button>
              <button onClick={doDel} style={{ ...SS.saveBtn, background: "#dc2626" }}>🗑️ {t.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const SS = {
  wrap:     { padding: 20, backgroundColor: "#f5f3ff", minHeight: "100vh", fontFamily: "sans-serif" },
  header:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:    { fontSize: 24, fontWeight: "bold", color: "#1e293b", margin: 0 },
  addBtn:   { background: "#7c3aed", color: "white", padding: "10px 20px", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: "bold", fontSize: 14, whiteSpace: "nowrap" },
  fBar:     { background: "white", padding: 15, borderRadius: 12, marginBottom: 20, display: "flex", gap: 15, alignItems: "center", flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,.05)" },
  sInp:     { flex: 1, minWidth: 200, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" },
  chk:      { display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer", userSelect: "none" },
  totBox:   { background: "#faf5ff", padding: "8px 16px", borderRadius: 8, border: "1px solid #e9d5ff", display: "flex", alignItems: "center", gap: 6 },
  tWrap:    { background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.05)" },
  table:    { width: "100%", borderCollapse: "collapse", minWidth: 800 },
  th:       { padding: "12px 14px", textAlign: "left", background: "#7c3aed", color: "white", fontSize: 13, fontWeight: 600 },
  td:       { padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 14, color: "#334155", verticalAlign: "middle" },
  avatar:   { width: 36, height: 36, borderRadius: "50%", background: "#7c3aed", color: "white", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  iBtn:     { border: "none", color: "white", borderRadius: 6, padding: "5px 8px", margin: "0 2px", cursor: "pointer", fontSize: 14 },
  aBtn:     { border: "1px solid #e2e8f0", background: "white", borderRadius: 6, padding: "5px 8px", margin: "0 2px", cursor: "pointer", fontSize: 14 },
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, padding: 16, backdropFilter: "blur(2px)" },
  modal:    { background: "white", borderRadius: 16, width: "100%", maxWidth: 500, overflow: "hidden", boxShadow: "0 25px 50px rgba(0,0,0,.25)", maxHeight: "90vh", overflowY: "auto" },
  mHead:    { padding: "15px 20px", background: "#7c3aed", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 1 },
  mFoot:    { padding: "15px 20px", background: "#f8fafc", display: "flex", justifyContent: "flex-end", gap: 10, position: "sticky", bottom: 0 },
  closeBtn: { background: "rgba(255,255,255,.2)", border: "none", color: "white", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
  canBtn:   { padding: "10px 20px", border: "1px solid #e2e8f0", background: "white", borderRadius: 8, cursor: "pointer", fontSize: 14 },
  saveBtn:  { padding: "10px 20px", border: "none", background: "#7c3aed", color: "white", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 14, display: "flex", alignItems: "center" },
  inp:      { padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" },
  lbl:      { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5, color: "#374151" },
  err:      { margin: "4px 0 0", fontSize: 11, color: "#ef4444", fontWeight: 600 },
  avatarUp: { width: 80, height: 80, borderRadius: "50%", border: "2px dashed #c4b5fd", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" },
  conBtn:   { width: "100%", padding: 10, marginBottom: 15, background: "#dcfce7", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 },
};
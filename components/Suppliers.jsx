'use client';

// src/components/Suppliers.jsx
// ═══════════════════════════════════════════════════════════════
// v2.1 — Next.js App Router Compatible + Accurate Supplier Debt Calculations
// ═══════════════════════════════════════════════════════════════

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo
} from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { localDb, ensureDbOpen } from "@/lib/localDb";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, onSnapshot, query, where,
  Timestamp, runTransaction, serverTimestamp
} from "firebase/firestore";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const MAX_AMT = 10_000_000;
const PURCHASE_COLLECTIONS = ["purchases", "purchaseInvoices"];

const PAY_METHODS = [
  { value: "cash", label: "💵", si: "මුදල්", en: "Cash" },
  { value: "bank", label: "🏦", si: "බැංකු මාරු", en: "Bank Transfer" },
  { value: "cheque", label: "📝", si: "චෙක්පත", en: "Cheque" }
];

// ═══════════════════════════════════════════════════════════
// HELPERS (ACCURATE DEBT CALCULATIONS)
// ═══════════════════════════════════════════════════════════
const getSupBal = (s) => {
  if (!s) return 0;
  if (s.currentBalance !== undefined && s.currentBalance !== null && !isNaN(Number(s.currentBalance))) {
    return Number(s.currentBalance);
  }
  if (s.balance !== undefined && s.balance !== null && !isNaN(Number(s.balance))) {
    return Number(s.balance);
  }
  if (s.openingBalance !== undefined && s.openingBalance !== null && !isNaN(Number(s.openingBalance))) {
    return Number(s.openingBalance);
  }
  return 0;
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
// REPAIR / RECALCULATE SUPPLIER DEBTS FROM INVOICES
// ═══════════════════════════════════════════════════════════
const repairFromPurchaseInvoices = async (userUid) => {
  try {
    await ensureDbOpen();
    console.log("🔧 Repairing supplier debt balances...");
    
    // Fetch local and remote purchase invoices
    let allInvoices = [];
    for (const colName of PURCHASE_COLLECTIONS) {
      if (localDb[colName]) {
        const localInvs = await localDb[colName].toArray();
        allInvoices.push(...localInvs);
      }
      if (navigator.onLine && db) {
        try {
          const invSnap = await getDocs(collection(db, colName));
          invSnap.docs.forEach((d) => allInvoices.push({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn(`Firestore read warning for ${colName}:`, e);
        }
      }
    }

    const balMap = new Map();
    const cntMap = new Map();
    const seen = new Set();

    allInvoices.forEach((data) => {
      const invId = data.id || data.docId;
      if (seen.has(invId)) return;
      seen.add(invId);

      const sid = data.supplierId || data.supplier_id || "";
      if (!sid) return;

      const bal = parseFloat(data.balanceAmount ?? data.currentBalance ?? data.balance ?? 0);
      balMap.set(sid, (balMap.get(sid) || 0) + bal);
      cntMap.set(sid, (cntMap.get(sid) || 0) + 1);
    });

    const localSuppliers = await localDb.suppliers.toArray();
    let fixed = 0;

    for (const sup of localSuppliers) {
      const sid = sup.id || sup.docId;
      const openBal = parseFloat(sup.openingBalance || 0);
      const invBal = Math.round((balMap.get(sid) || 0) * 100) / 100;
      const correct = Math.round((openBal + invBal) * 100) / 100;

      // Update Local Dexie DB
      await localDb.suppliers.update(sid, {
        balance: correct,
        currentBalance: correct,
        invoiceBalance: invBal,
        updatedAt: new Date().toISOString()
      });

      // Update Firestore
      if (navigator.onLine && db) {
        try {
          await updateDoc(doc(db, "suppliers", String(sid)), {
            balance: correct,
            currentBalance: correct,
            invoiceBalance: invBal,
            lastRepairAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn("Firestore supplier repair warning:", e);
        }
      }
      fixed++;
    }

    alert(`✅ සැපයුම්කරුවන් ${fixed} දෙනෙකුගේ ණය මුදල් ගණනය කර සාර්ථකව යාවත්කාලීන කරන ලදී!`);
  } catch (err) {
    console.error("❌ Repair failed:", err);
    alert("❌ ගණනය කිරීමේ දෝෂයක් සිදු විය: " + err.message);
  }
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

    window.addEventListener('app-language-change', handleLangEvent);
    return () => window.removeEventListener('app-language-change', handleLangEvent);
  }, [externalLang]);

  const t = useMemo(() => TT[lang] || TT.si, [lang]);
  return { lang, t };
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  const hide = useCallback(() => setToast(null), []);
  return { toast, show, hide };
}

function useSuppliers() {
  const [suppliers, setSup] = useState([]);
  const [loading, setL] = useState(true);

  const fetchSuppliers = useCallback(async () => {
    try {
      await ensureDbOpen();
      const localData = await localDb.suppliers.toArray();
      setSup(localData.sort((a, b) => getTS(b) - getTS(a)));
      setL(false);

      if (navigator.onLine && db) {
        const u = onSnapshot(collection(db, "suppliers"), (snap) => {
          const cloudData = snap.docs.map((d) => ({ id: d.id, docId: d.id, ...d.data() }));
          setSup(cloudData.sort((a, b) => getTS(b) - getTS(a)));
          localDb.suppliers.bulkPut(cloudData).catch(() => {});
        });
        return () => u();
      }
    } catch (e) {
      console.warn("Suppliers load warning:", e);
      setL(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  return { suppliers, loading, refresh: fetchSuppliers };
}

function useBanks() {
  const [banks, setB] = useState([]);
  const [bL, setBL] = useState(true);

  useEffect(() => {
    async function loadBanks() {
      try {
        await ensureDbOpen();
        const localBanks = await localDb.bankAccounts.toArray();
        setB(localBanks);
        setBL(false);
      } catch (e) {
        setBL(false);
      }
    }
    loadBanks();
  }, []);

  return { banks, bL };
}

// ═══════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════
const Toast = memo(({ toast, onClose }) => {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 24px", borderRadius: 12, color: "white", fontWeight: 700, fontSize: 14, maxWidth: 350, boxShadow: "0 8px 24px rgba(0,0,0,.15)", background: toast.type === "success" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#ef4444,#dc2626)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }} onClick={onClose}>
      <span style={{ flex: 1 }}>{toast.msg}</span><span>✕</span>
    </div>
  );
});

const PayModal = memo(({ show, type, supplier, onClose, onConfirm, busy, banks, bL, t }) => {
  const [amt, setAmt] = useState("");
  const [meth, setMeth] = useState("cash");
  const [ref, setRef] = useState("");
  const [bid, setBid] = useState("");
  const [aErr, setAErr] = useState("");

  useEffect(() => { if (show) { setAmt(""); setMeth("cash"); setRef(""); setBid(""); setAErr(""); } }, [show]);

  if (!show || !supplier) return null;
  const curBal = getSupBal(supplier);
  const isPay = type === "pay";
  const hc = isPay ? "#16a34a" : "#3b82f6";

  const confirm = () => {
    const e = valAmt(amt);
    if (e) { setAErr(e); return; }
    onConfirm({
      amount: parseFloat(amt), method: meth, reference: ref,
      bankAccountId: meth === "bank" ? bid : null,
    });
  };

  return (
    <div style={SS.overlay} onClick={busy ? undefined : onClose}>
      <div style={{ ...SS.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...SS.mHead, background: hc }}>
          <h3 style={{ margin: 0 }}>{isPay ? "💸" : "📥"} {isPay ? t.makePay : t.recvPay}</h3>
          <button onClick={onClose} disabled={busy} style={SS.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, marginBottom: 18, border: "1px solid #e2e8f0" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{supplier.name}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>{t.balance}:</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: curBal > 0 ? "#dc2626" : "#16a34a" }}>{fmtCur(curBal)}</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={SS.lbl}>{isPay ? t.amtPay : t.amtRecv} (Rs.) *</label>
            <input type="number" step="0.01" style={{ ...SS.inp, width: "100%", fontSize: 22, fontWeight: 800, color: hc }} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" autoFocus disabled={busy} />
            {aErr && <p style={SS.err}>{aErr}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={SS.lbl}>{t.payMeth}</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {PAY_METHODS.map((pm) => (
                <button key={pm.value} onClick={() => setMeth(pm.value)} style={{ padding: 10, borderRadius: 8, border: meth === pm.value ? "2px solid #2563eb" : "1px solid #cbd5e1", background: meth === pm.value ? "#eff6ff" : "white", cursor: "pointer" }}>
                  {pm.label} {t[pm.value] || pm.en}
                </button>
              ))}
            </div>
          </div>

          <button onClick={confirm} disabled={busy || !amt} style={{ width: "100%", padding: 14, background: hc, color: "white", border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 16, cursor: "pointer" }}>
            {busy ? t.loading : isPay ? t.payNow : t.recvNow}
          </button>
        </div>
      </div>
    </div>
  );
});

const SupRow = memo(({ sup, idx, t, onNav, onRecv, onPay, onEdit, onDel }) => {
  const bal = getSupBal(sup);
  return (
    <tr style={{ backgroundColor: idx % 2 === 0 ? "white" : "#faf5ff" }}>
      <td style={SS.td}>{idx + 1}</td>
      <td style={SS.td}>
        <div style={SS.avatar}>{sup.name?.[0]?.toUpperCase() ?? "?"}</div>
      </td>
      <td style={SS.td}>
        <div onClick={() => onNav(sup.id)} style={{ fontWeight: 600, color: "#7c3aed", cursor: "pointer" }}>{sup.name}</div>
        {sup.companyName && <div style={{ fontSize: 11, color: "#64748b" }}>{sup.companyName}</div>}
      </td>
      <td style={SS.td}>{sup.phone || "-"}</td>
      <td style={SS.td}>{sup.city || sup.address || "-"}</td>
      <td style={{ ...SS.td, textAlign: "right", fontWeight: "bold", color: bal > 0 ? "#dc2626" : "#16a34a" }}>{fmtCur(bal)}</td>
      <td style={{ ...SS.td, textAlign: "center" }}>
        <button onClick={() => onRecv(sup)} style={{ ...SS.aBtn, background: "#dbeafe" }}>📥</button>
        <button onClick={() => onPay(sup)} style={{ ...SS.aBtn, background: "#dcfce7" }}>💸</button>
        <button onClick={() => onEdit(sup)} style={SS.aBtn}>✏️</button>
        <button onClick={() => onDel(sup.id)} style={{ ...SS.aBtn, background: "#fef2f2", color: "red" }}>🗑️</button>
      </td>
    </tr>
  );
});

// ═══════════════════════════════════════════════════════════
// MAIN SUPPLIERS COMPONENT
// ═══════════════════════════════════════════════════════════
export default function Suppliers({ lang: externalLang }) {
  const router = useRouter();
  const { lang, t } = useLanguage(externalLang);
  const { toast, show: showToast, hide: hideToast } = useToast();
  const { suppliers, loading, refresh } = useSuppliers();
  const { banks, bL } = useBanks();

  const [user, setUser] = useState(null);
  const [srch, setSrch] = useState("");
  const [credOnly, setCredOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [delId, setDelId] = useState(null);
  const [payMod, setPayMod] = useState({ show: false, type: "pay", sup: null });
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ id: null, name: "", companyName: "", phone: "", email: "", address: "", city: "", openingBalance: "" });

  useEffect(() => {
    const activeAuth = auth || getAuth();
    if (activeAuth) {
      onAuthStateChanged(activeAuth, (u) => setUser(u || { uid: "local_user" }));
    } else {
      setUser({ uid: "local_user" });
    }
  }, []);

  const filtered = useMemo(() => {
    const lo = srch.toLowerCase().trim();
    return suppliers.filter((s) => {
      const m = (s.name || "").toLowerCase().includes(lo) || (s.phone || "").includes(srch.trim());
      return m && (!credOnly || getSupBal(s) > 0);
    });
  }, [suppliers, srch, credOnly]);

  const totalBal = useMemo(() => filtered.reduce((s, sup) => s + getSupBal(sup), 0), [filtered]);

  const openForm = useCallback((sup = null) => {
    if (sup) { setForm({ ...sup, openingBalance: sup.openingBalance ?? "" }); setIsEdit(true); }
    else { setForm({ id: null, name: "", companyName: "", phone: "", email: "", address: "", city: "", openingBalance: "" }); setIsEdit(false); }
    setShowForm(true);
  }, []);

  const doSave = useCallback(async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { alert(t.nameReq); return; }
    try {
      await ensureDbOpen();
      const now = new Date().toISOString();
      const supId = form.id || `sup_${Date.now()}`;
      const ob = parseFloat(form.openingBalance) || 0;

      const supPayload = {
        id: supId,
        docId: supId,
        name: form.name.trim(),
        companyName: form.companyName?.trim() || "",
        phone: form.phone?.trim() || "",
        email: form.email?.trim() || "",
        address: form.address?.trim() || "",
        city: form.city?.trim() || "",
        openingBalance: ob,
        balance: isEdit ? form.balance : ob,
        currentBalance: isEdit ? (form.currentBalance ?? form.balance) : ob,
        updatedAt: now,
        synced: false
      };

      await localDb.suppliers.put(supPayload);

      if (navigator.onLine && db) {
        try {
          await updateDoc(doc(db, "suppliers", supId), { ...supPayload, synced: true });
        } catch (e) {
          // If document doesn't exist, create it
          await addDoc(collection(db, "suppliers"), { ...supPayload, synced: true });
        }
      }

      showToast(t.save + " ✅");
      setShowForm(false);
      refresh();
    } catch (err) { showToast(t.errSave + ": " + err.message, "error"); }
  }, [form, isEdit, t, showToast, refresh]);

  const handlePay = useCallback(async ({ amount, method, reference }) => {
    const { type, sup } = payMod;
    if (!sup || busy) return;
    setBusy(true);
    const isPay = type === "pay";

    try {
      await ensureDbOpen();
      const nowIso = new Date().toISOString();
      const cur = getSupBal(sup);
      const newB = isPay ? cur - amount : cur + amount;

      // Local Dexie Update
      await localDb.suppliers.update(sup.id, {
        balance: newB,
        currentBalance: newB,
        updatedAt: nowIso,
        synced: false
      });

      // Firestore Update
      if (navigator.onLine && db) {
        try {
          await updateDoc(doc(db, "suppliers", String(sup.id)), {
            balance: newB,
            currentBalance: newB,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.warn("Firestore supplier pay update error:", e);
        }
      }

      showToast(isPay ? t.payOK : t.recvOK);
      setPayMod({ show: false, type: "pay", sup: null });
      refresh();
    } catch (err) {
      showToast((isPay ? t.errPay : t.errRecv) + ": " + err.message, "error");
    } finally { setBusy(false); }
  }, [payMod, busy, t, showToast, refresh]);

  return (
    <div style={SS.wrap}>
      <Toast toast={toast} onClose={hideToast} />

      <div style={SS.header}>
        <div>
          <h1 style={SS.title}>{t.title}</h1>
          <div style={{ fontSize: 12, color: "#64748b" }}>එකතුව: {suppliers.length} | ණය ඇති අය: {suppliers.filter(s => getSupBal(s) > 0).length}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => repairFromPurchaseInvoices(user?.uid)} style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", padding: "10px 14px", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>
            🔄 Recalculate Balances
          </button>
          <button onClick={() => openForm()} style={SS.addBtn}>{t.newSup}</button>
        </div>
      </div>

      <div style={SS.fBar}>
        <input type="text" placeholder={t.search} style={SS.sInp} value={srch} onChange={(e) => setSrch(e.target.value)} />
        <label style={SS.chk}>
          <input type="checkbox" checked={credOnly} onChange={(e) => setCredOnly(e.target.checked)} />
          <span>{t.creditOnly}</span>
        </label>
        <div style={SS.totBox}>
          <span style={{ color: "#64748b", fontSize: 12 }}>{t.total}:</span>
          <span style={{ fontWeight: "bold", fontSize: 18, color: totalBal > 0 ? "#dc2626" : "#16a34a" }}>{fmtCur(totalBal)}</span>
        </div>
      </div>

      <div style={SS.tWrap}>
        <table style={SS.table}>
          <thead>
            <tr>
              <th style={{ ...SS.th, width: 40 }}>#</th>
              <th style={{ ...SS.th, width: 50 }}>{t.image}</th>
              <th style={SS.th}>{t.name}</th>
              <th style={SS.th}>{t.mobile}</th>
              <th style={SS.th}>{t.address}</th>
              <th style={{ ...SS.th, textAlign: "right" }}>{t.balance}</th>
              <th style={{ ...SS.th, textAlign: "center" }}>{t.action}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ ...SS.td, textAlign: "center", padding: 30 }}>⏳ {t.loading}</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan="7" style={{ ...SS.td, textAlign: "center", padding: 30, color: "#94a3b8" }}>{t.noData}</td></tr>
            ) : filtered.map((sup, i) => (
              <SupRow key={sup.id || i} sup={sup} idx={i} t={t}
                onNav={(id) => router.push(`/suppliers/${id}`)}
                onRecv={(s) => setPayMod({ show: true, type: "receive", sup: s })}
                onPay={(s) => setPayMod({ show: true, type: "pay", sup: s })}
                onEdit={openForm}
                onDel={async (id) => {
                  if (confirm(t.confirmDel)) {
                    await localDb.suppliers.delete(id);
                    if (navigator.onLine && db) await deleteDoc(doc(db, "suppliers", String(id)));
                    refresh();
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PayModal show={payMod.show} type={payMod.type} supplier={payMod.sup} onClose={() => setPayMod({ show: false, type: "pay", sup: null })} onConfirm={handlePay} busy={busy} banks={banks} bL={bL} t={t} />

      {showForm && (
        <div style={SS.overlay} onClick={() => setShowForm(false)}>
          <div style={SS.modal} onClick={(e) => e.stopPropagation()}>
            <div style={SS.mHead}><h3 style={{ margin: 0 }}>{isEdit ? t.editSup : t.addSup}</h3></div>
            <div style={{ padding: 20 }}>
              <input style={{ ...SS.inp, width: "100%", marginBottom: 10 }} placeholder={t.supName} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
              <input style={{ ...SS.inp, width: "100%", marginBottom: 10 }} placeholder={t.phone} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              <input style={{ ...SS.inp, width: "100%", marginBottom: 10 }} placeholder={t.company} value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
              <input style={{ ...SS.inp, width: "100%", marginBottom: 10 }} placeholder={t.addr} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              {!isEdit && <input style={{ ...SS.inp, width: "100%", marginBottom: 10 }} type="number" placeholder={t.openBal} value={form.openingBalance} onChange={(e) => setForm((p) => ({ ...p, openingBalance: e.target.value }))} />}
            </div>
            <div style={SS.mFoot}>
              <button onClick={() => setShowForm(false)} style={SS.canBtn}>{t.cancel}</button>
              <button onClick={doSave} style={SS.saveBtn}>{t.save}</button>
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
  wrap: { padding: 20, backgroundColor: "#f5f3ff", minHeight: "100vh", fontFamily: "sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", color: "#1e293b", margin: 0 },
  addBtn: { background: "#7c3aed", color: "white", padding: "10px 20px", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: "bold" },
  fBar: { background: "white", padding: 15, borderRadius: 12, marginBottom: 20, display: "flex", gap: 15, alignItems: "center", flexWrap: "wrap" },
  sInp: { flex: 1, minWidth: 200, padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", outline: "none" },
  chk: { display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" },
  totBox: { background: "#faf5ff", padding: "8px 16px", borderRadius: 8, border: "1px solid #e9d5ff" },
  tWrap: { background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.05)" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: "12px 14px", textAlign: "left", background: "#7c3aed", color: "white", fontSize: 13, fontWeight: 600 },
  td: { padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 14, color: "#334155" },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "#7c3aed", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" },
  aBtn: { border: "1px solid #e2e8f0", background: "white", borderRadius: 6, padding: "5px 8px", margin: "0 2px", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000 },
  modal: { background: "white", borderRadius: 16, width: "100%", maxWidth: 450, overflow: "hidden" },
  mHead: { padding: "15px 20px", background: "#7c3aed", color: "white" },
  mFoot: { padding: "15px 20px", background: "#f8fafc", display: "flex", justifyContent: "flex-end", gap: 10 },
  closeBtn: { background: "rgba(255,255,255,.2)", border: "none", color: "white", borderRadius: "50%", width: 28, height: 28, cursor: "pointer" },
  canBtn: { padding: "10px 20px", border: "1px solid #e2e8f0", background: "white", borderRadius: 8, cursor: "pointer" },
  saveBtn: { padding: "10px 20px", border: "none", background: "#7c3aed", color: "white", borderRadius: 8, cursor: "pointer", fontWeight: "bold" },
  inp: { padding: 10, borderRadius: 8, border: "1px solid #e2e8f0", outline: "none", boxSizing: "border-box" },
  lbl: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 },
  err: { margin: "4px 0 0", fontSize: 11, color: "#ef4444" },
};
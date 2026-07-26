// src/components/Customers.jsx
// ★ v13 Next.js — InvoiceOutputManager integrated for receipt sharing
// ★ Payment & Credit receipts via unified Output Manager
// ★ Synthetic invoice object creation for non-invoice transactions

"use client";

import React, {
  useState, useEffect, useRef, useMemo, useCallback,
} from "react";
import { db } from "../firebaseConfig";
import { useUserAuth } from "../context/UserContext";
import {
  collection, onSnapshot, query, where, addDoc, updateDoc,
  doc, getDocs, serverTimestamp, Timestamp, increment,
} from "firebase/firestore";
import { useRouter } from "next/navigation";   // ★ Next.js
import InvoiceOutputManager from "./InvoiceOutputManager";

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const nn  = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = v => nn(v).toLocaleString("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fmtMoney = v => {
  const n = nn(v);
  return `${n < 0 ? "-" : ""}Rs.${fmt(Math.abs(n))}`;
};

/* ════════════════════════════════════════
   ★★★ SYNTHETIC INVOICE BUILDER ★★★
════════════════════════════════════════ */
const buildSyntheticInvoice = (shareData, customer) => {
  if (!shareData) return null;

  const {
    type, customerName, customerPhone,
    amount, method, bankLabel, note,
    previousBalance, newBalance,
    date, refNo,
  } = shareData;

  const isPayment = type === "payment";
  const now       = new Date();

  const methodMap = {
    cash: "cash", bank: "etransfer", card: "card",
    cheque: "cheque", online: "etransfer", credit: "credit",
  };

  const invoiceMethod = methodMap[method] || "cash";
  const paidAmt       = nn(amount);
  const netAmt        = nn(amount);
  const bal           = nn(newBalance);

  const itemName = isPayment
    ? (bankLabel ? `ගෙවීම (${bankLabel})` : "ගෙවීම් රිසිට්පත")
    : "ණය ඇතුළු කිරීම";

  return {
    id:          `${type}-${refNo}`,
    invoiceNo:   refNo,
    invoiceCode: `${isPayment ? "PAY" : "CRD"}-${refNo}`,
    customerId:      customer?.id || "",
    customerName:    customerName || "",
    customerPhone:   customerPhone || "",
    customerAddress: customer?.address || "",
    items: [
      {
        name:         itemName,
        nameSi:       isPayment ? "ගෙවීම" : "ණය",
        qty:          1,
        sellingPrice: paidAmt,
        yourPrice:    paidAmt,
        uom:          "unit",
        lineTotal:    paidAmt,
        warrantyCode: "",
      },
    ],
    grossTotal:          paidAmt,
    totalDiscount:       0,
    billDiscount:        0,
    billDiscountPercent: 0,
    exchangeAmount:      0,
    returnAmount:        0,
    netAmount:           netAmt,
    payAmount:           isPayment ? paidAmt : 0,
    balance:             isPayment ? 0 : -paidAmt,
    paymentMethod:       invoiceMethod,
    remarks:             note || "",
    invoiceRemark:       note || "",
    previousOutstanding:    nn(previousBalance),
    newOutstanding:         bal,
    customerCurrentBalance: bal,
    createdAt: { toDate: () => now },
    date:      date || now.toLocaleDateString("en-GB"),
    status:    "completed",
    type:      "receipt",
    _collection:  "customerTransactions",
    _isReceipt:   true,
    _receiptType: type,
  };
};

/* ════════════════════════════════════════
   TRANSLATIONS
════════════════════════════════════════ */
const translations = {
  si: {
    title: "පාරිභෝගිකයින්",
    addNew: "නව පාරිභෝගිකයෙක්",
    importContact: "දුරකථනයෙන් ගන්න",
    search: "නම / දුරකථනය සොයන්න...",
    showCredit: "ණය ඇති අය පමණක්",
    name: "නම", mobile: "දුරකථනය", address: "ලිපිනය", balance: "ශේෂය",
    action: "ක්‍රියා", view: "බලන්න", loading: "පූරණය වෙමින්...",
    noData: "පාරිභෝගිකයින් හමු නොවීය",
    pending: "අනුමැතියට ඇත",
    save: "සුරකින්න", cancel: "අවලංගු",
    adding: "එකතු කරමින්...", success: "සාර්ථකව ඇතුළත් කරන ලදී!",
    uploadPhoto: "ඡායාරූපයක් එක් කරන්න",
    loginRequired: "කරුණාකර පළමුව ලොග් වන්න",
    totalReceivables: "ලබාගත යුතු මුළු හිඟ මුදල",
    totalOverpaid: "මුළු අතිරේක ගෙවීම්",
    settled: "පියවා ඇත",
    totalCustomers: "මුළු පාරිභෝගිකයින්",
    creditCustomers: "ණය ඇති",
    settledCustomers: "පියවා ඇති",
    overpaidCustomers: "අතිරේක ගෙවූ",
    showing: "පෙන්වන්නේ", of: "න්",
    sortBy: "අනුපිළිවෙල",
    sortNameAZ: "නම (අ-ඔ)", sortNameZA: "නම (ඔ-අ)",
    sortBalHigh: "ශේෂය (වැඩි→අඩු)", sortBalLow: "ශේෂය (අඩු→වැඩි)",
    sortNewest: "අලුත්ම පළමුව", sortOldest: "පැරණිම පළමුව",
    exportCSV: "CSV බාගන්න", print: "මුද්‍රණය",
    cardView: "කාඩ්පත්", tableView: "වගුව",
    perPage: "පිටුවට", prev: "පෙර", next: "ඊළඟ", page: "පිටුව",
    email: "ඊමේල්", nic: "හැඳුනුම්පත", notes: "සටහන්",
    whatsapp: "WhatsApp", call: "ඇමතීම", clearSearch: "ඉවත්",
    receivePayment: "මුදල් ලබාගැනීම",
    amountReceived: "ලැබෙන මුදල",
    paymentMethod: "ගෙවීම් ක්‍රමය",
    reference: "යොමු අංකය (Optional)",
    receiveNow: "ලබාගන්න",
    paymentSuccess: "✅ මුදල් ලබාගැනීම සාර්ථකයි!",
    paymentNote: "ගෙවීම් සටහන (Optional)",
    selectBank: "බැංකු ගිණුම තෝරන්න",
    noBankAccounts: "බැංකු ගිණුම් නොමැත.",
    bankAccount: "බැංකු ගිණුම",
    addCreditTitle: "ණය ඇතුළත් කිරීම",
    creditAmount: "ණය මුදල",
    creditNote: "ණය විස්තරය",
    addCredit: "ණය ඇතුළත් කරන්න",
    creditSuccess: "✅ ණය සාර්ථකව ඇතුළත් විය!",
    newBalance: "නව ශේෂය",
    previousBalance: "පෙර ශේෂය",
    creditInfoMsg:
      'මෙම ණය Cash Management හි "පාරිභෝගික ණය (OUT)" ලෙස පෙනෙනු ඇත.',
    portalLink: "👤 Portal ලින්ක්",
    copyPortalLink: "🔗 Copy Link",
    portalLinkCopied: "✅ Copied!",
    openPortal: "🌐 Open",
    generatePortalKey: "🔑 Portal Key",
    generatingKey: "⏳...",
    portalKeyGenerated: "✅ Portal Key Generated!",
    currentBalance: "වත්මන් ශේෂය",
    shareReceipt: "රිසිට්පත යවන්න",
    noPhoneWarning: "දුරකථන අංකය නොමැත",
    overpaid: "අතිරේක ගෙවීම",
    rental: "කුලී", newRental: "නව කුලිය",
    viewRentals: "කුලී ඉතිහාසය", rentalHistory: "කුලී වාර්තාව",
    sendReceipt: "📤 රිසිට්පත යවන්න",
  },
  en: {
    title: "Customers",
    addNew: "New Customer",
    importContact: "Import Contact",
    search: "Search Name / Mobile...",
    showCredit: "Credit Only",
    name: "Name", mobile: "Mobile", address: "Address", balance: "Balance",
    action: "Action", view: "View", loading: "Loading...",
    noData: "No customers found",
    pending: "Pending",
    save: "Save", cancel: "Cancel",
    adding: "Adding...", success: "Customer added successfully!",
    uploadPhoto: "Upload Photo",
    loginRequired: "Please login first",
    totalReceivables: "Total Receivables",
    totalOverpaid: "Total Overpaid",
    settled: "Settled",
    totalCustomers: "Total Customers",
    creditCustomers: "Credit",
    settledCustomers: "Settled",
    overpaidCustomers: "Overpaid",
    showing: "Showing", of: "of",
    sortBy: "Sort",
    sortNameAZ: "Name (A-Z)", sortNameZA: "Name (Z-A)",
    sortBalHigh: "Balance (High→Low)", sortBalLow: "Balance (Low→High)",
    sortNewest: "Newest First", sortOldest: "Oldest First",
    exportCSV: "Export CSV", print: "Print",
    cardView: "Cards", tableView: "Table",
    perPage: "Per Page", prev: "Prev", next: "Next", page: "Page",
    email: "Email", nic: "NIC", notes: "Notes",
    whatsapp: "WhatsApp", call: "Call", clearSearch: "Clear",
    receivePayment: "Receive Payment",
    amountReceived: "Amount Received",
    paymentMethod: "Payment Method",
    reference: "Reference (Optional)",
    receiveNow: "Receive Now",
    paymentSuccess: "✅ Payment received successfully!",
    paymentNote: "Payment Note (Optional)",
    selectBank: "Select Bank Account",
    noBankAccounts: "No bank accounts.",
    bankAccount: "Bank Account",
    addCreditTitle: "Add Credit Entry",
    creditAmount: "Credit Amount",
    creditNote: "Credit Description",
    addCredit: "Add Credit",
    creditSuccess: "✅ Credit added successfully!",
    newBalance: "New Balance",
    previousBalance: "Previous Balance",
    creditInfoMsg:
      'This credit will appear as "Customer Credit (OUT)" in Cash Management.',
    portalLink: "👤 Portal Link",
    copyPortalLink: "🔗 Copy Link",
    portalLinkCopied: "✅ Copied!",
    openPortal: "🌐 Open",
    generatePortalKey: "🔑 Portal Key",
    generatingKey: "⏳...",
    portalKeyGenerated: "✅ Portal Key Generated!",
    currentBalance: "Current Balance",
    shareReceipt: "Share Receipt",
    noPhoneWarning: "No phone number available",
    overpaid: "Overpaid",
    rental: "Rental", newRental: "New Rental",
    viewRentals: "Rental History", rentalHistory: "Rental History",
    sendReceipt: "📤 Send Receipt",
  },
};

/* ════════════════════════════════════════
   PORTAL KEY HELPERS
════════════════════════════════════════ */
const slugify = s =>
  String(s || "customer")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const makePortalKey = name =>
  `${slugify(name)}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

// ★ Next.js: window.location.origin → env variable or typeof window guard
const getPortalLink = key => {
  if (!key) return "";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/portal/${key}`;
};

/* ════════════════════════════════════════
   RENTAL HISTORY MODAL
════════════════════════════════════════ */
function RentalHistoryModal({ customer, onClose, lang }) {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUserAuth();

  useEffect(() => {
    if (!user?.uid || !customer?.id) return;
    setLoading(true);
    const q = query(
      collection(db, "rentalBookings"),
      where("uid", "==", user.uid),
      where("customerId", "==", customer.id)
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );
        setRentals(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user, customer]);

  const statusColors = {
    active:    { bg: "#fef3c7", color: "#92400e" },
    returned:  { bg: "#dcfce7", color: "#166534" },
    completed: { bg: "#dcfce7", color: "#166534" },
    overdue:   { bg: "#fee2e2", color: "#991b1b" },
    pending:   { bg: "#e0f2fe", color: "#0369a1" },
    cancelled: { bg: "#f1f5f9", color: "#475569" },
  };

  const totalRevenue = rentals.reduce((s, r) => s + nn(r.totalAmount), 0);
  const activeCount  = rentals.filter(r => r.status === "active").length;

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modalContent, maxWidth: 680 }}>
        <div style={styles.modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🏗️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, color: "#1e293b" }}>
                {lang === "si" ? "කුලී ඉතිහාසය" : "Rental History"}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                {customer.name} · {customer.phone}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
          marginBottom: 16,
        }}>
          {[
            { icon: "📋", label: lang === "si" ? "මුළු"      : "Total",   value: rentals.length,             color: "#3b82f6" },
            { icon: "📤", label: lang === "si" ? "ක්‍රියාත්මක" : "Active",  value: activeCount,                color: "#f59e0b" },
            { icon: "💰", label: lang === "si" ? "මුළු මුදල"  : "Revenue", value: `Rs.${fmt(totalRevenue)}`,  color: "#10b981" },
          ].map((s, i) => (
            <div key={i} style={{
              padding: "12px 14px",
              background: "#f8fafc",
              borderRadius: 12,
              borderLeft: `4px solid ${s.color}`,
            }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {s.icon} {s.label}
              </div>
              <div style={{
                fontSize: 18, fontWeight: 800, color: s.color, marginTop: 2,
              }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* List */}
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{
                width: 32, height: 32,
                border: "3px solid #e2e8f0",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 10px",
              }} />
              {lang === "si" ? "පූරණය..." : "Loading..."}
            </div>
          ) : rentals.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
              {lang === "si" ? "කුලී ඉතිහාසය නොමැත" : "No rental history"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rentals.map(r => {
                const today = new Date().toISOString().split("T")[0];
                const isOverdue =
                  r.status === "active" &&
                  r.expectedReturnDate &&
                  r.expectedReturnDate < today;
                const displayStatus = isOverdue ? "overdue" : r.status;
                const sc      = statusColors[displayStatus] || statusColors.pending;
                const balance = nn(r.totalAmount) - nn(r.advance);

                return (
                  <div key={r.id} style={{
                    padding: "12px 16px",
                    background: isOverdue ? "#fff5f5" : "#f8fafc",
                    borderRadius: 12,
                    border: `1px solid ${isOverdue ? "#fecaca" : "#e2e8f0"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{
                        display: "flex", alignItems: "center",
                        gap: 8, marginBottom: 4,
                      }}>
                        <span style={{ fontWeight: 700, color: "#3b82f6", fontSize: 12 }}>
                          #{r.ref}
                        </span>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: sc.bg,
                          color: sc.color,
                          fontSize: 10,
                          fontWeight: 700,
                        }}>
                          {isOverdue ? "⚠️ Overdue" : r.status}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
                        📦 {r.itemName || "-"}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        📅 {r.startDate}
                        {r.expectedReturnDate ? ` → ${r.expectedReturnDate}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        Rs.{fmt(nn(r.totalAmount))}
                      </div>
                      {balance > 0.01 && (
                        <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                          Due: Rs.{fmt(balance)}
                        </div>
                      )}
                      {balance <= 0 && (
                        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                          ✅ Paid
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          {/* ★ Next.js: window.open → router.push or <a target="_blank"> */}
          <a
            href={`/rental/bookings?customerId=${customer.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg,#f97316,#ea580c)",
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            🏗️ {lang === "si" ? "නව කුලිය" : "New Rental"}
          </a>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              background: "#f1f5f9",
              color: "#475569",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            ✕ {lang === "si" ? "වසන්න" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   ★★★ MAIN COMPONENT ★★★
════════════════════════════════════════ */
export default function Customers({ lang = "si" }) {
  const t            = translations[lang] || translations.en;
  const { user, loading: authLoading } = useUserAuth();
  const router       = useRouter();          // ★ Next.js
  const fileInputRef = useRef(null);

  /* ── State ── */
  const [customers,      setCustomers]      = useState([]);
  const [approvalCounts, setApprovalCounts] = useState({});
  const [loading,        setLoading]        = useState(true);
  const [searchTerm,     setSearchTerm]     = useState("");
  const [showCreditOnly, setShowCreditOnly] = useState(false);
  const [sortBy,         setSortBy]         = useState("balHigh");
  const [viewMode,       setViewMode]       = useState("table");
  const [page,           setPage]           = useState(1);
  const [perPage,        setPerPage]        = useState(25);

  const [showModal,   setShowModal]   = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "", phone: "", address: "", email: "", nic: "", notes: "",
    profilePicture: "",
  });
  const [phoneSuffix, setPhoneSuffix] = useState("");
  const [isSaving,    setIsSaving]    = useState(false);

  const [showPaymentModal,      setShowPaymentModal]      = useState(false);
  const [selectedCustomer,      setSelectedCustomer]      = useState(null);
  const [paymentAmount,         setPaymentAmount]         = useState("");
  const [paymentMethod,         setPaymentMethod]         = useState("cash");
  const [paymentRef,            setPaymentRef]            = useState("");
  const [paymentNote,           setPaymentNote]           = useState("");
  const [isPaying,              setIsPaying]              = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditCustomer,  setCreditCustomer]  = useState(null);
  const [creditAmount,    setCreditAmount]    = useState("");
  const [creditNote,      setCreditNote]      = useState("");
  const [isAddingCredit,  setIsAddingCredit]  = useState(false);

  const [bankAccounts,    setBankAccounts]    = useState([]);
  const [invoiceSettings, setInvoiceSettings] = useState(null);
  const [copiedPortalId,  setCopiedPortalId]  = useState(null);
  const [generatingKeyId, setGeneratingKeyId] = useState(null);

  const [outputInvoice,  setOutputInvoice]  = useState(null);
  const [outputCustomer, setOutputCustomer] = useState(null);

  const [rentalHistoryCustomer, setRentalHistoryCustomer] = useState(null);
  const [customerRentalCounts,  setCustomerRentalCounts]  = useState({});

  /* ════════════════════════════════════════
     DATA LOADING
  ════════════════════════════════════════ */
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setCustomers([]); setLoading(false); return; }
    setLoading(true);

    const unsubCustomers = onSnapshot(
      query(collection(db, "customers"), where("uid", "==", user.uid)),
      snap => {
        const list = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          currentBalance: nn(d.data().currentBalance),
        }));
        list.sort((a, b) => b.currentBalance - a.currentBalance);
        setCustomers(list);
        setLoading(false);
      },
      err => { console.error(err); setLoading(false); }
    );

    const unsubApprovals = onSnapshot(
      query(
        collection(db, "transactionApprovals"),
        where("status", "==", "pending")
      ),
      snap => {
        const counts = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.customerId)
            counts[data.customerId] = (counts[data.customerId] || 0) + 1;
        });
        setApprovalCounts(counts);
      },
      () => {}
    );

    const unsubBanks = onSnapshot(
      collection(db, `users/${user.uid}/bankAccounts`),
      snap =>
        setBankAccounts(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => a.isActive !== false)
        ),
      () => {}
    );

    const unsubRentals = onSnapshot(
      query(collection(db, "rentalBookings"), where("uid", "==", user.uid)),
      snap => {
        const counts = {};
        snap.docs.forEach(d => {
          const cId = d.data().customerId;
          if (cId) counts[cId] = (counts[cId] || 0) + 1;
        });
        setCustomerRentalCounts(counts);
      },
      () => {}
    );

    getDocs(
      query(collection(db, "invoice_settings"), where("uid", "==", user.uid))
    )
      .then(s => { if (!s.empty) setInvoiceSettings(s.docs[0].data()); })
      .catch(() => {});

    return () => {
      unsubCustomers();
      unsubApprovals();
      unsubBanks();
      unsubRentals();
    };
  }, [user, authLoading]);

  /* ════════════════════════════════════════
     PORTAL KEY
  ════════════════════════════════════════ */
  const handleGeneratePortalKey = useCallback(
    async cus => {
      if (!user || generatingKeyId) return;
      setGeneratingKeyId(cus.id);
      try {
        const key = makePortalKey(cus.name || "customer");
        await updateDoc(doc(db, "customers", cus.id), {
          portalAccessKey: key,
          updatedAt: serverTimestamp(),
        });
        alert(t.portalKeyGenerated);
      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        setGeneratingKeyId(null);
      }
    },
    [user, generatingKeyId, t]
  );

  const handleCopyPortalLink = useCallback(async cus => {
    const url = getPortalLink(cus.portalAccessKey);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedPortalId(cus.id);
    setTimeout(() => setCopiedPortalId(null), 3000);
  }, []);

  /* ════════════════════════════════════════
     RENTAL  ★ router.push instead of navigate
  ════════════════════════════════════════ */
  const openNewRental = useCallback(
    cus => router.push(`/rental/bookings?customerId=${cus.id}`),
    [router]
  );
  const openRentalHistory = useCallback(
    cus => setRentalHistoryCustomer(cus),
    []
  );

  /* ════════════════════════════════════════
     CONTACT IMPORT
  ════════════════════════════════════════ */
  const handleImportContact = async () => {
    if ("contacts" in navigator && "ContactsManager" in window) {
      try {
        const propsToSelect   = ["name", "tel"];
        const supportedProps  = await navigator.contacts.getProperties();
        if (supportedProps.includes("icon")) propsToSelect.push("icon");

        const contacts = await navigator.contacts.select(propsToSelect, {
          multiple: false,
        });
        if (contacts.length > 0) {
          const contact = contacts[0];
          let cleanPhone =
            contact.tel && contact.tel[0]
              ? contact.tel[0].replace(/\D/g, "")
              : "";
          if (cleanPhone.startsWith("94")) cleanPhone = cleanPhone.substring(2);
          if (cleanPhone.startsWith("0"))  cleanPhone = cleanPhone.substring(1);

          let profilePicture = "";
          if (contact.icon && contact.icon.length > 0) {
            profilePicture = await new Promise(resolve => {
              const reader    = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror   = () => resolve("");
              reader.readAsDataURL(contact.icon[0]);
            });
          }
          setNewCustomer(prev => ({
            ...prev,
            name:           (contact.name && contact.name[0]) || prev.name,
            profilePicture: profilePicture || prev.profilePicture,
          }));
          setPhoneSuffix(cleanPhone);
        }
      } catch {
        alert("Contact access denied.");
      }
    } else {
      alert("Browser not supported.");
    }
  };

  /* ════════════════════════════════════════
     PHOTO UPLOAD
  ════════════════════════════════════════ */
  const handlePhotoUpload = e => {
    const file = e.target.files[0];
    if (!file) return;

    const compress = blob => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img    = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > 300) { h = (h * 300) / w; w = 300; }
          canvas.width  = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          setNewCustomer(prev => ({
            ...prev,
            profilePicture: canvas.toDataURL("image/jpeg", 0.7),
          }));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(blob);
    };

    if (file.size > 2 * 1024 * 1024) {
      compress(file);
    } else {
      const reader     = new FileReader();
      reader.onloadend = () =>
        setNewCustomer(prev => ({ ...prev, profilePicture: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  /* ════════════════════════════════════════
     ADD CUSTOMER
  ════════════════════════════════════════ */
  const handleAddCustomer = async e => {
    e.preventDefault();
    if (!newCustomer.name || !phoneSuffix)
      return alert("Please enter Name and Phone Number");
    if (!user) return alert(t.loginRequired);
    setIsSaving(true);
    try {
      const portalAccessKey = makePortalKey(newCustomer.name);
      await addDoc(collection(db, "customers"), {
        name:           newCustomer.name,
        phone:          `+94${phoneSuffix}`,
        address:        newCustomer.address || "",
        email:          newCustomer.email   || "",
        nic:            newCustomer.nic     || "",
        notes:          newCustomer.notes   || "",
        profilePicture: newCustomer.profilePicture || "",
        photoURL:       newCustomer.profilePicture || "",
        uid:            user.uid,
        currentBalance: 0,
        portalAccessKey,
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      });
      alert(t.success);
      setShowModal(false);
      setNewCustomer({
        name: "", phone: "", address: "", email: "",
        nic: "", notes: "", profilePicture: "",
      });
      setPhoneSuffix("");
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  /* ════════════════════════════════════════
     MODAL OPENERS
  ════════════════════════════════════════ */
  const openPaymentModal = cus => {
    setSelectedCustomer(cus);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentRef("");
    setPaymentNote("");
    setSelectedBankAccountId(bankAccounts.length > 0 ? bankAccounts[0].id : "");
    setShowPaymentModal(true);
  };

  const openCreditModal = cus => {
    setCreditCustomer(cus);
    setCreditAmount("");
    setCreditNote("");
    setShowCreditModal(true);
  };

  /* ════════════════════════════════════════
     OPEN OUTPUT MANAGER
  ════════════════════════════════════════ */
  const openOutputManager = useCallback((shareData, customer) => {
    const syntheticInvoice = buildSyntheticInvoice(shareData, customer);
    if (!syntheticInvoice) return;
    setOutputInvoice(syntheticInvoice);
    setOutputCustomer(customer);
  }, []);

  /* ════════════════════════════════════════
     PAYMENT
  ════════════════════════════════════════ */
  const handlePayment = async () => {
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return alert("Please enter a valid amount");
    if (!user)             return alert(t.loginRequired);
    if (paymentMethod === "bank" && !selectedBankAccountId) {
      return alert(
        lang === "si"
          ? "බැංකු ගිණුමක් තෝරන්න!"
          : "Please select a bank account!"
      );
    }
    setIsPaying(true);
    try {
      const now        = new Date();
      const todayStr   = now.toISOString().split("T")[0];
      const timeStr    = now.toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
      const refNo        = now.getTime().toString(36).toUpperCase().slice(-8);
      const currentBal   = nn(selectedCustomer.currentBalance);
      const newBal       = currentBal - amt;
      const selectedBank = bankAccounts.find(a => a.id === selectedBankAccountId);
      const bankLabel    = selectedBank
        ? `${selectedBank.bankName} - ${selectedBank.accountName}`
        : "";
      const noteText = paymentNote
        || `Payment (${paymentMethod})${bankLabel ? " via " + bankLabel : ""}${paymentRef ? " - Ref: " + paymentRef : ""}`;

      const cusTxnRef = await addDoc(
        collection(db, "customerTransactions"),
        {
          uid:              user.uid,
          customerId:       selectedCustomer.id,
          customerName:     selectedCustomer.name  || "",
          customerPhone:    selectedCustomer.phone || "",
          type:             "payment",
          amount:           amt,
          date:             todayStr,
          time:             timeStr,
          note:             noteText,
          paymentMethod,
          reference:        paymentRef,
          source:           "manual",
          status:           "approved",
          receiptImage:     null,
          bankAccountId:    paymentMethod === "bank" ? selectedBankAccountId : "",
          bankName:         paymentMethod === "bank" ? (selectedBank?.bankName        || "") : "",
          bankAccountName:  paymentMethod === "bank" ? (selectedBank?.accountName     || "") : "",
          bankAccountNumber:paymentMethod === "bank" ? (selectedBank?.accountNumber   || "") : "",
          createdAt:        serverTimestamp(),
          timestamp:        now.getTime(),
        }
      );

      await updateDoc(doc(db, "customers", selectedCustomer.id), {
        currentBalance: increment(-amt),
        updatedAt:      serverTimestamp(),
      });

      await addDoc(
        collection(db, `users/${user.uid}/cashTransactions`),
        {
          type:            "in",
          source:          "invoicePayment",
          category:        "invoicePayment",
          description:     `💵 ${selectedCustomer.name} — ගෙවීම ලැබිණ${paymentNote ? " | " + paymentNote : ""}`,
          amount:          amt,
          paymentMethod,
          customerId:      selectedCustomer.id,
          customerName:    selectedCustomer.name  || "",
          customerPhone:   selectedCustomer.phone || "",
          customerTxnId:   cusTxnRef.id,
          reference:       paymentRef,
          notes:           noteText,
          bankAccountId:   paymentMethod === "bank" ? selectedBankAccountId : "",
          bankAccountName: paymentMethod === "bank" ? bankLabel              : "",
          bankName:        paymentMethod === "bank" ? (selectedBank?.bankName || "") : "",
          date:            todayStr,
          time:            timeStr,
          timestamp:       Timestamp.fromDate(new Date(`${todayStr}T12:00:00`)),
          createdAt:       serverTimestamp(),
          createdBy:       user.email || "Unknown",
          uid:             user.uid,
          isAutomatic:     true,
        }
      );

      if (paymentMethod === "bank" && selectedBankAccountId && selectedBank) {
        await updateDoc(
          doc(db, `users/${user.uid}/bankAccounts`, selectedBankAccountId),
          { currentBalance: increment(amt), updatedAt: serverTimestamp() }
        );
        await addDoc(
          collection(db, `users/${user.uid}/bankTransactions`),
          {
            type:        "deposit",
            accountId:   selectedBankAccountId,
            amount:      amt,
            date:        Timestamp.fromDate(now),
            description: `${selectedCustomer.name} — Customer Payment`,
            reference:   paymentRef || `PAY-${selectedCustomer.id.slice(0, 6).toUpperCase()}`,
            createdAt:   serverTimestamp(),
            updatedAt:   serverTimestamp(),
            source:      "customerPayment",
            customerId:  selectedCustomer.id,
            customerTxnId: cusTxnRef.id,
          }
        );
      }

      setShowPaymentModal(false);
      openOutputManager(
        {
          type:            "payment",
          customerName:    selectedCustomer.name,
          customerPhone:   selectedCustomer.phone,
          amount:          amt,
          method:          paymentMethod,
          bankLabel,
          note:            paymentNote || "",
          previousBalance: currentBal,
          newBalance:      newBal,
          date:            todayStr,
          refNo,
        },
        selectedCustomer
      );
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsPaying(false);
    }
  };

  /* ════════════════════════════════════════
     ADD CREDIT
  ════════════════════════════════════════ */
  const handleAddCredit = async () => {
    const amt = parseFloat(creditAmount);
    if (!amt || amt <= 0) {
      return alert(
        lang === "si" ? "වලංගු මුදලක් ඇතුළු කරන්න" : "Enter a valid amount"
      );
    }
    if (!user) return alert(t.loginRequired);
    setIsAddingCredit(true);
    try {
      const now      = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const timeStr  = now.toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
      const refNo      = now.getTime().toString(36).toUpperCase().slice(-8);
      const currentBal = nn(creditCustomer.currentBalance);
      const newBal     = currentBal + amt;

      const cusTxnRef = await addDoc(
        collection(db, "customerTransactions"),
        {
          uid:          user.uid,
          customerId:   creditCustomer.id,
          customerName: creditCustomer.name  || "",
          customerPhone:creditCustomer.phone || "",
          type:         "credit",
          amount:       amt,
          date:         todayStr,
          time:         timeStr,
          note:         creditNote || (lang === "si" ? "ණය ඇතුළු කිරීම" : "Credit entry"),
          source:       "manual_credit",
          status:       "approved",
          createdAt:    serverTimestamp(),
          timestamp:    now.getTime(),
          createdBy:    user.email || "Unknown",
        }
      );

      await updateDoc(doc(db, "customers", creditCustomer.id), {
        currentBalance: increment(amt),
        updatedAt:      serverTimestamp(),
      });

      await addDoc(
        collection(db, `users/${user.uid}/cashTransactions`),
        {
          type:         "out",
          source:       "customerCredit",
          category:     "customerCredit",
          description:  `👤 ${creditCustomer.name} — ණය${creditNote ? " | " + creditNote : ""}`,
          amount:       amt,
          paymentMethod:"credit",
          customerId:   creditCustomer.id,
          customerName: creditCustomer.name  || "",
          customerPhone:creditCustomer.phone || "",
          customerTxnId:cusTxnRef.id,
          notes:        creditNote || "",
          date:         todayStr,
          time:         timeStr,
          timestamp:    Timestamp.fromDate(new Date(`${todayStr}T12:00:00`)),
          createdAt:    serverTimestamp(),
          createdBy:    user.email || "Unknown",
          uid:          user.uid,
          isAutomatic:  true,
        }
      );

      setShowCreditModal(false);
      setCreditCustomer(null);
      setCreditAmount("");
      setCreditNote("");

      openOutputManager(
        {
          type:            "credit",
          customerName:    creditCustomer.name,
          customerPhone:   creditCustomer.phone,
          amount:          amt,
          method:          "credit",
          bankLabel:       "",
          note:            creditNote || "",
          previousBalance: currentBal,
          newBalance:      newBal,
          date:            todayStr,
          refNo,
        },
        creditCustomer
      );
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsAddingCredit(false);
    }
  };

  /* ════════════════════════════════════════
     STATS
  ════════════════════════════════════════ */
  const stats = useMemo(() => {
    const total            = customers.length;
    const totalReceivables = customers.reduce(
      (s, c) => s + Math.max(0, nn(c.currentBalance)), 0
    );
    const totalOverpaid = customers.reduce(
      (s, c) => s + Math.abs(Math.min(0, nn(c.currentBalance))), 0
    );
    const creditCount   = customers.filter(c => nn(c.currentBalance) > 0.01).length;
    const overpaidCount = customers.filter(c => nn(c.currentBalance) < -0.01).length;
    const settledCount  = total - creditCount - overpaidCount;
    const totalRentals  = Object.values(customerRentalCounts).reduce(
      (s, v) => s + v, 0
    );
    return {
      total, totalReceivables, totalOverpaid,
      creditCount, overpaidCount, settledCount, totalRentals,
    };
  }, [customers, customerRentalCounts]);

  /* ════════════════════════════════════════
     FILTERED & SORTED
  ════════════════════════════════════════ */
  const filteredCustomers = useMemo(() => {
    const words = searchTerm
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0);

    let result = customers.filter(c => {
      const hay = [c.name, c.phone, c.address, c.email, c.nic]
        .join(" ")
        .toLowerCase();
      return (
        (words.length === 0 || words.every(w => hay.includes(w))) &&
        (showCreditOnly ? nn(c.currentBalance) > 0 : true)
      );
    });

    switch (sortBy) {
      case "nameAZ":  result.sort((a, b) => (a.name || "").localeCompare(b.name || "")); break;
      case "nameZA":  result.sort((a, b) => (b.name || "").localeCompare(a.name || "")); break;
      case "balHigh": result.sort((a, b) => nn(b.currentBalance) - nn(a.currentBalance)); break;
      case "balLow":  result.sort((a, b) => nn(a.currentBalance) - nn(b.currentBalance)); break;
      case "newest":  result.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); break;
      case "oldest":  result.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); break;
      default: break;
    }
    return result;
  }, [customers, searchTerm, showCreditOnly, sortBy]);

  const totalPages     = Math.ceil(filteredCustomers.length / perPage);
  const pagedCustomers = useMemo(
    () => filteredCustomers.slice((page - 1) * perPage, page * perPage),
    [filteredCustomers, page, perPage]
  );

  useEffect(() => { setPage(1); }, [searchTerm, showCreditOnly, sortBy, perPage]);

  /* ════════════════════════════════════════
     EXPORTS
  ════════════════════════════════════════ */
  const exportCSV = useCallback(() => {
    const hdr  = ["#", "Name", "Phone", "Address", "Email", "NIC",
                  "Balance (Rs.)", "Rentals", "Notes", "Portal Link"];
    const rows = filteredCustomers.map((c, i) => [
      i + 1,
      (c.name || "").replace(/,/g, ";"),
      c.phone || "",
      (c.address || "").replace(/,/g, ";"),
      c.email || "",
      c.nic   || "",
      nn(c.currentBalance).toFixed(2),
      customerRentalCounts[c.id] || 0,
      (c.notes || "").replace(/,/g, ";"),
      getPortalLink(c.portalAccessKey) || "",
    ]);
    const csv  = [hdr, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `customers_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filteredCustomers, customerRentalCounts]);

  const handlePrint = useCallback(() => {
    const html = `<html><head><title>${t.title}</title>
<style>body{font-family:Arial;padding:20px;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid #ddd;padding:8px}th{background:#f0f0f0}
.credit{color:#dc2626;font-weight:bold}
.settled{color:#16a34a}
.overpaid{color:#2563eb;font-weight:bold}</style></head><body>
<h1>👥 ${t.title}</h1>
<p>${t.totalReceivables}: Rs.${fmt(stats.totalReceivables)} | ${t.totalOverpaid}: Rs.${fmt(stats.totalOverpaid)}</p>
<table><tr><th>#</th><th>${t.name}</th><th>${t.mobile}</th><th>${t.address}</th><th>${t.balance}</th><th>Rentals</th></tr>
${filteredCustomers.map((c, i) => {
  const b   = nn(c.currentBalance);
  const cls = b > 0.01 ? "credit" : b < -0.01 ? "overpaid" : "settled";
  const lbl = b > 0.01
    ? `Rs.${fmt(b)}`
    : b < -0.01 ? `-Rs.${fmt(Math.abs(b))}` : t.settled;
  return `<tr><td>${i + 1}</td><td>${c.name || "-"}</td><td>${c.phone || "-"}</td><td>${c.address || "-"}</td><td class="${cls}">${lbl}</td><td>${customerRentalCounts[c.id] || 0}</td></tr>`;
}).join("")}
</table></body></html>`;

    // ★ Next.js: window.open is fine in "use client" components
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 500);
  }, [filteredCustomers, stats, t, customerRentalCounts]);

  /* ════════════════════════════════════════
     QUICK ACTIONS
  ════════════════════════════════════════ */
  const handleWhatsAppQuick = phone => {
    if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank");
  };
  const handleCall = phone => {
    if (phone) window.location.href = `tel:${phone}`;
  };

  const highlightText = (text, search) => {
    if (!search || !text) return text;
    const words = search.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0);
    if (!words.length) return text;
    let result = text;
    words.forEach(word => {
      result = result.replace(
        new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
        "⟨HL⟩$1⟨/HL⟩"
      );
    });
    return result.split(/⟨\/?HL⟩/).map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} style={{
          background: "#fef08a", padding: "0 2px",
          borderRadius: 2, fontWeight: 700,
        }}>
          {part}
        </mark>
      ) : part
    );
  };

  /* ════════════════════════════════════════
     SUB-COMPONENTS
  ════════════════════════════════════════ */
  const BalanceBadge = ({ balance }) => {
    const b = nn(balance);
    if (b > 0.01)
      return <div style={{ fontWeight: 800, color: "#dc2626", fontSize: 16 }}>Rs.{fmt(b)}</div>;
    if (b < -0.01)
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ fontWeight: 800, color: "#2563eb", fontSize: 14 }}>
            -Rs.{fmt(Math.abs(b))}
          </div>
          <div style={{
            fontSize: 10, color: "#2563eb", fontWeight: 600, marginTop: 1,
            background: "#eff6ff", padding: "1px 6px", borderRadius: 8,
          }}>
            💰 {lang === "si" ? "අතිරේකව ගෙව්වා" : "Overpaid"}
          </div>
        </div>
      );
    return <div style={styles.settledBadge}>✅ {t.settled}</div>;
  };

  const PortalCell = ({ cus }) => {
    const hasKey    = !!cus.portalAccessKey;
    const isCopied  = copiedPortalId === cus.id;
    const isGenning = generatingKeyId === cus.id;

    if (!hasKey)
      return (
        <button
          onClick={e => { e.stopPropagation(); handleGeneratePortalKey(cus); }}
          disabled={isGenning}
          style={{
            padding: "5px 10px", borderRadius: 8,
            border: "1px dashed #93c5fd", background: "#eff6ff",
            color: "#1d4ed8", cursor: isGenning ? "not-allowed" : "pointer",
            fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          {isGenning ? t.generatingKey : t.generatePortalKey}
        </button>
      );

    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {/* ★ Next.js: use <a> for external links */}
        <a
          href={getPortalLink(cus.portalAccessKey)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            padding: "5px 10px", borderRadius: 8,
            background: "#eff6ff", color: "#1d4ed8",
            textDecoration: "none", fontSize: 11,
            fontWeight: 700, border: "1px solid #bfdbfe", whiteSpace: "nowrap",
          }}
        >
          {t.openPortal}
        </a>
        <button
          onClick={e => { e.stopPropagation(); handleCopyPortalLink(cus); }}
          style={{
            padding: "5px 10px", borderRadius: 8,
            background: isCopied ? "#dcfce7" : "#f8fafc",
            color: isCopied ? "#16a34a" : "#475569",
            border: "1px solid #e2e8f0",
            cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          {isCopied ? t.portalLinkCopied : t.copyPortalLink}
        </button>
      </div>
    );
  };

  /* ════════════════════════════════════════
     LOADING
  ════════════════════════════════════════ */
  if (authLoading || loading)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontWeight: 600, fontSize: 18 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{
          width: 40, height: 40,
          border: "4px solid #e2e8f0",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "spin .8s linear infinite",
          margin: "0 auto 12px",
        }} />
        {t.loading}
      </div>
    );

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <div style={styles.container}>

      {/* ★★★ InvoiceOutputManager Modal ★★★ */}
      {outputInvoice && (
        <InvoiceOutputManager
          invoice={outputInvoice}
          onClose={() => { setOutputInvoice(null); setOutputCustomer(null); }}
        />
      )}

      {/* Rental History Modal */}
      {rentalHistoryCustomer && (
        <RentalHistoryModal
          customer={rentalHistoryCustomer}
          onClose={() => setRentalHistoryCustomer(null)}
          lang={lang}
        />
      )}

      {/* ═══ HEADER ═══ */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>👥</span>
          <div>
            <h2 style={styles.title}>{t.title}</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              {stats.total} {t.totalCustomers}
              {stats.totalRentals > 0 && (
                <span style={{
                  marginLeft: 8, padding: "2px 8px",
                  background: "#fff7ed", color: "#ea580c",
                  borderRadius: 8, fontSize: 11, fontWeight: 700,
                }}>
                  🏗️ {stats.totalRentals} {lang === "si" ? "කුලී" : "Rentals"}
                </span>
              )}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportCSV}   style={styles.exportBtn} title={t.exportCSV}>📥</button>
          <button onClick={handlePrint} style={styles.exportBtn} title={t.print}>🖨️</button>
          <button
            onClick={() => router.push("/rental")}   // ★ router.push
            style={{
              ...styles.addButton,
              background: "linear-gradient(135deg,#f97316,#ea580c)",
              boxShadow: "0 4px 12px rgba(249,115,22,0.3)",
            }}
          >
            🏗️ {lang === "si" ? "කුලී" : "Rental"}
          </button>
          <button onClick={() => setShowModal(true)} style={styles.addButton}>
            ➕ {t.addNew}
          </button>
        </div>
      </div>

      {/* ═══ STATS ═══ */}
      <div style={styles.statsGrid}>
        {[
          { bg: "linear-gradient(135deg,#fef2f2,#fee2e2)", bc: "#fca5a5", tc: "#991b1b", icon: "💸", label: t.totalReceivables,        value: `Rs.${fmt(stats.totalReceivables)}`, vc: "#dc2626" },
          { bg: "linear-gradient(135deg,#eff6ff,#dbeafe)", bc: "#93c5fd", tc: "#1e40af", icon: "👥", label: t.totalCustomers,           value: stats.total,                         vc: "#2563eb" },
          { bg: "linear-gradient(135deg,#fff7ed,#fed7aa)", bc: "#fdba74", tc: "#9a3412", icon: "⚠️", label: t.creditCustomers,         value: stats.creditCount,                   vc: "#ea580c" },
          { bg: "linear-gradient(135deg,#eff6ff,#dbeafe)", bc: "#93c5fd", tc: "#1e40af", icon: "💰", label: t.overpaidCustomers || "Overpaid", value: `${stats.overpaidCount} (Rs.${fmt(stats.totalOverpaid)})`, vc: "#2563eb" },
          { bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)", bc: "#86efac", tc: "#166534", icon: "✅", label: t.settledCustomers,         value: stats.settledCount,                  vc: "#16a34a" },
          { bg: "linear-gradient(135deg,#fff7ed,#fed7aa)", bc: "#fdba74", tc: "#9a3412", icon: "🏗️", label: lang === "si" ? "කුලී" : "Rentals", value: stats.totalRentals, vc: "#ea580c" },
        ].map((s, i) => (
          <div key={i} style={{ ...styles.statCard, background: s.bg, borderColor: s.bc }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.tc }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.vc, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ═══ FILTERS ═══ */}
      <div style={styles.filterRow}>
        <div style={{ position: "relative", flex: 2, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 12, top: 12, color: "#94a3b8", pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            placeholder={t.search}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={styles.clearSearchBtn}
            >✕</button>
          )}
        </div>

        <label style={{
          ...styles.checkboxLabel,
          ...(showCreditOnly ? { borderColor: "#dc2626", background: "#fef2f2" } : {}),
        }}>
          <input
            type="checkbox"
            checked={showCreditOnly}
            onChange={e => setShowCreditOnly(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "#dc2626" }}
          />
          <span style={{
            color: showCreditOnly ? "#dc2626" : "#475569",
            fontWeight: showCreditOnly ? 700 : 500,
            fontSize: 13,
          }}>
            💳 {t.showCredit}
          </span>
        </label>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={styles.sortSelect}
        >
          <option value="balHigh">📉 {t.sortBalHigh}</option>
          <option value="balLow">📈 {t.sortBalLow}</option>
          <option value="nameAZ">🔤 {t.sortNameAZ}</option>
          <option value="nameZA">🔤 {t.sortNameZA}</option>
          <option value="newest">🆕 {t.sortNewest}</option>
          <option value="oldest">📅 {t.sortOldest}</option>
        </select>

        <div style={styles.viewToggle}>
          <button
            onClick={() => setViewMode("table")}
            style={{ ...styles.viewBtn2, ...(viewMode === "table" ? styles.viewBtnOn : {}) }}
          >📋</button>
          <button
            onClick={() => setViewMode("cards")}
            style={{ ...styles.viewBtn2, ...(viewMode === "cards" ? styles.viewBtnOn : {}) }}
          >🃏</button>
        </div>
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 12, padding: "0 4px",
      }}>
        <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {t.showing} {pagedCustomers.length} {t.of} {filteredCustomers.length}
          {filteredCustomers.length !== customers.length &&
            ` (${customers.length} ${t.totalCustomers})`}
        </span>
      </div>

      {/* ═══ TABLE VIEW ═══ */}
      {viewMode === "table" && (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                {["#", "", t.name, t.mobile, t.address, t.balance,
                  "🏗️", t.portalLink, t.action].map((h, i) => (
                  <th key={i} style={{ ...styles.th, textAlign: i === 5 ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedCustomers.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: 50, textAlign: "center", color: "#94a3b8" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                    <div style={{ fontSize: 15 }}>{t.noData}</div>
                  </td>
                </tr>
              ) : pagedCustomers.map((cus, index) => {
                const bal       = nn(cus.currentBalance);
                const globalIdx = (page - 1) * perPage + index + 1;
                const rentalCnt = customerRentalCounts[cus.id] || 0;

                return (
                  <tr
                    key={cus.id}
                    style={styles.tr}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={styles.td}>{globalIdx}</td>
                    <td style={styles.td}>
                      {cus.profilePicture ? (
                        <img
                          src={cus.profilePicture}
                          style={styles.avatarImg}
                          alt=""
                        />
                      ) : (
                        <div style={styles.avatarPlaceholder}>
                          {(cus.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 15 }}>
                        {highlightText(cus.name || "", searchTerm)}
                      </div>
                      {cus.email && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          📧 {cus.email}
                        </div>
                      )}
                      {approvalCounts[cus.id] > 0 && (
                        <span style={styles.approvalBadge}>
                          🔔 {approvalCounts[cus.id]} {t.pending}
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{highlightText(cus.phone || "-", searchTerm)}</span>
                        {cus.phone && (
                          <div style={{ display: "flex", gap: 2 }}>
                            <button
                              onClick={e => { e.stopPropagation(); handleWhatsAppQuick(cus.phone); }}
                              style={styles.quickActionBtn}
                            >💬</button>
                            <button
                              onClick={e => { e.stopPropagation(); handleCall(cus.phone); }}
                              style={styles.quickActionBtn}
                            >📞</button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>{cus.address || "-"}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <BalanceBadge balance={bal} />
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      {rentalCnt > 0 ? (
                        <button
                          onClick={e => { e.stopPropagation(); openRentalHistory(cus); }}
                          style={{
                            padding: "4px 10px", borderRadius: 20,
                            background: "#fff7ed", color: "#ea580c",
                            border: "1px solid #fdba74",
                            cursor: "pointer", fontSize: 11, fontWeight: 700,
                          }}
                        >
                          🏗️ {rentalCnt}
                        </button>
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={styles.td}><PortalCell cus={cus} /></td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <div style={{
                        display: "flex", justifyContent: "center",
                        gap: 5, flexWrap: "wrap",
                      }}>
                        <button
                          onClick={e => { e.stopPropagation(); openNewRental(cus); }}
                          style={{ ...styles.viewBtn, background: "#fff7ed", color: "#ea580c", borderColor: "#fdba74" }}
                          title={t.newRental}
                        >🏗️</button>
                        <button
                          onClick={e => { e.stopPropagation(); openRentalHistory(cus); }}
                          style={{ ...styles.viewBtn, background: "#f8fafc", color: "#475569", borderColor: "#cbd5e1" }}
                          title={t.viewRentals}
                        >📋</button>
                        <button
                          onClick={e => { e.stopPropagation(); openCreditModal(cus); }}
                          style={{ ...styles.viewBtn, background: "#fef2f2", color: "#dc2626", borderColor: "#fca5a5" }}
                        >➕</button>
                        <button
                          onClick={e => { e.stopPropagation(); openPaymentModal(cus); }}
                          style={{ ...styles.viewBtn, background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }}
                        >💰</button>
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/customers/${cus.id}`); }}
                          style={styles.viewBtn}
                        >👁️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ CARD VIEW ═══ */}
      {viewMode === "cards" && (
        <div style={styles.cardGrid}>
          {pagedCustomers.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 50, color: "#94a3b8" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15 }}>{t.noData}</div>
            </div>
          ) : pagedCustomers.map(cus => {
            const bal       = nn(cus.currentBalance);
            const rentalCnt = customerRentalCounts[cus.id] || 0;

            return (
              <div
                key={cus.id}
                style={{
                  ...styles.customerCard,
                  borderLeftColor: bal > 0.01 ? "#dc2626" : bal < -0.01 ? "#2563eb" : "#16a34a",
                }}
                onClick={() => router.push(`/customers/${cus.id}`)}  // ★ router.push
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  {cus.profilePicture ? (
                    <img
                      src={cus.profilePicture}
                      style={{ ...styles.avatarImg, width: 48, height: 48 }}
                      alt=""
                    />
                  ) : (
                    <div style={{ ...styles.avatarPlaceholder, width: 48, height: 48, fontSize: 20 }}>
                      {(cus.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 16, color: "#1e293b",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {highlightText(cus.name || "", searchTerm)}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      {cus.phone || "-"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}><BalanceBadge balance={bal} /></div>
                </div>

                {cus.address && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                    📍 {cus.address}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {approvalCounts[cus.id] > 0 && (
                    <span style={styles.approvalBadge}>
                      🔔 {approvalCounts[cus.id]} {t.pending}
                    </span>
                  )}
                  {rentalCnt > 0 && (
                    <span
                      onClick={e => { e.stopPropagation(); openRentalHistory(cus); }}
                      style={{
                        padding: "2px 8px", background: "#fff7ed",
                        color: "#ea580c", border: "1px solid #fdba74",
                        borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      🏗️ {rentalCnt} {lang === "si" ? "කුලී" : "rentals"}
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 4, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                  <PortalCell cus={cus} />
                </div>

                <div style={{
                  display: "flex", gap: 5, marginTop: 8,
                  justifyContent: "flex-end", flexWrap: "wrap",
                }}>
                  {cus.phone && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); handleWhatsAppQuick(cus.phone); }}
                        style={styles.cardActionBtn}
                      >💬</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleCall(cus.phone); }}
                        style={styles.cardActionBtn}
                      >📞</button>
                    </>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); openNewRental(cus); }}
                    style={{ ...styles.cardActionBtn, background: "#fff7ed", color: "#ea580c", border: "1px solid #fdba74", fontWeight: 700 }}
                  >🏗️</button>
                  <button
                    onClick={e => { e.stopPropagation(); openRentalHistory(cus); }}
                    style={{ ...styles.cardActionBtn, background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontWeight: 700 }}
                  >📋</button>
                  <button
                    onClick={e => { e.stopPropagation(); openCreditModal(cus); }}
                    style={{ ...styles.cardActionBtn, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", fontWeight: 600 }}
                  >➕</button>
                  <button
                    onClick={e => { e.stopPropagation(); openPaymentModal(cus); }}
                    style={{ ...styles.cardActionBtn, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", fontWeight: 600 }}
                  >💰</button>
                  <button
                    onClick={e => { e.stopPropagation(); router.push(`/customers/${cus.id}`); }}
                    style={{ ...styles.cardActionBtn, background: "#eff6ff", color: "#2563eb", border: "1px solid #93c5fd", fontWeight: 600, padding: "6px 14px" }}
                  >
                    👁️ {t.view}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ PAGINATION ═══ */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>{t.perPage}:</span>
            <select
              value={perPage}
              onChange={e => setPerPage(Number(e.target.value))}
              style={{ ...styles.sortSelect, width: 65, padding: "6px 8px" }}
            >
              {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...styles.pageBtn, opacity: page === 1 ? 0.4 : 1 }}
            >◀ {t.prev}</button>

            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pg;
              if (totalPages <= 7)             pg = i + 1;
              else if (page <= 4)              pg = i + 1;
              else if (page >= totalPages - 3) pg = totalPages - 6 + i;
              else                             pg = page - 3 + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  style={{ ...styles.pageNum, ...(page === pg ? styles.pageNumOn : {}) }}
                >
                  {pg}
                </button>
              );
            })}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ ...styles.pageBtn, opacity: page === totalPages ? 0.4 : 1 }}
            >{t.next} ▶</button>
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {t.page} {page} / {totalPages}
          </span>
        </div>
      )}

      {/* ═══ PAYMENT MODAL ═══ */}
      {showPaymentModal && selectedCustomer && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: 440 }}>
            <div style={{ ...styles.modalHeader, paddingBottom: 10 }}>
              <h3 style={{ margin: 0, color: "#16a34a", fontSize: 18 }}>
                💰 {t.receivePayment}
              </h3>
              <button onClick={() => setShowPaymentModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={{ padding: "10px 0 20px" }}>
              {/* Customer Info */}
              <div style={{ marginBottom: 15, padding: 14, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {selectedCustomer.profilePicture ? (
                    <img
                      src={selectedCustomer.profilePicture}
                      style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                      alt=""
                    />
                  ) : (
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "#3b82f6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontWeight: 700, fontSize: 16,
                    }}>
                      {(selectedCustomer.name || "?").charAt(0)}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
                      {selectedCustomer.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {selectedCustomer.phone}
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: 10, padding: "10px 14px", borderRadius: 10,
                  background: nn(selectedCustomer.currentBalance) < -0.01
                    ? "#eff6ff"
                    : nn(selectedCustomer.currentBalance) < 0.01
                    ? "#f0fdf4"
                    : "#fef2f2",
                  border: `1px solid ${
                    nn(selectedCustomer.currentBalance) < -0.01
                      ? "#bfdbfe"
                      : nn(selectedCustomer.currentBalance) < 0.01
                      ? "#bbf7d0"
                      : "#fecaca"
                  }`,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: nn(selectedCustomer.currentBalance) < -0.01
                      ? "#1e40af"
                      : nn(selectedCustomer.currentBalance) < 0.01
                      ? "#166534"
                      : "#991b1b",
                  }}>
                    {t.currentBalance}
                  </div>
                  <div style={{
                    fontSize: 26, fontWeight: 900, marginTop: 2,
                    color: nn(selectedCustomer.currentBalance) < -0.01
                      ? "#2563eb"
                      : nn(selectedCustomer.currentBalance) < 0.01
                      ? "#16a34a"
                      : "#dc2626",
                  }}>
                    {fmtMoney(nn(selectedCustomer.currentBalance))}
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>{t.amountReceived} *</label>
                <input
                  type="number"
                  autoFocus
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  style={{
                    ...styles.input,
                    fontSize: 24, fontWeight: "bold",
                    color: "#16a34a", textAlign: "center", padding: 16,
                  }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {nn(selectedCustomer.currentBalance) > 0 && (
                    <>
                      <button
                        onClick={() => setPaymentAmount(nn(selectedCustomer.currentBalance).toString())}
                        style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "1px solid #86efac", background: "#f0fdf4", color: "#16a34a", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >✅ Full</button>
                      <button
                        onClick={() => setPaymentAmount(Math.ceil(nn(selectedCustomer.currentBalance) / 2).toString())}
                        style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "1px solid #86efac", background: "#f0fdf4", color: "#16a34a", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Rs.{Math.ceil(nn(selectedCustomer.currentBalance) / 2).toLocaleString()}
                      </button>
                    </>
                  )}
                  {[1000, 5000, 10000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setPaymentAmount(amt.toString())}
                      style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "1px solid #86efac", background: "#f0fdf4", color: "#16a34a", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Rs.{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Balance Preview */}
              {nn(paymentAmount) > 0 && (() => {
                const preview = nn(selectedCustomer.currentBalance) - nn(paymentAmount);
                const isOver  = preview < -0.01;
                const isExact = Math.abs(preview) < 0.01;
                return (
                  <div style={{
                    marginBottom: 14, padding: "10px 14px",
                    background: isOver ? "#eff6ff" : "#f0fdf4",
                    borderRadius: 10,
                    border: `1px solid ${isOver ? "#bfdbfe" : "#bbf7d0"}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: isOver ? "#1e40af" : "#166534", fontWeight: 700 }}>
                        {t.newBalance}:
                      </span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: isOver ? "#2563eb" : "#16a34a" }}>
                        {fmtMoney(preview)}
                      </span>
                    </div>
                    {isExact && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                        ✅ {lang === "si" ? "සම්පූර්ණ ශේෂය ගෙවා ඇත!" : "Balance fully settled!"}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Method */}
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>{t.paymentMethod}</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                  {[
                    { value: "cash",   icon: "💵", label: "Cash"   },
                    { value: "bank",   icon: "🏦", label: "Bank"   },
                    { value: "card",   icon: "💳", label: "Card"   },
                    { value: "cheque", icon: "📝", label: "Cheque" },
                    { value: "online", icon: "📱", label: "Online" },
                  ].map(m => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setPaymentMethod(m.value);
                        if (m.value !== "bank") {
                          setSelectedBankAccountId("");
                        } else if (bankAccounts.length > 0 && !selectedBankAccountId) {
                          setSelectedBankAccountId(bankAccounts[0].id);
                        }
                      }}
                      style={{
                        padding: "10px 6px", borderRadius: 10, cursor: "pointer",
                        fontSize: 12, fontWeight: 700,
                        border:      paymentMethod === m.value ? "2px solid #16a34a" : "2px solid #e2e8f0",
                        background:  paymentMethod === m.value ? "#f0fdf4"           : "white",
                        color:       paymentMethod === m.value ? "#16a34a"           : "#64748b",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bank Selection */}
              {paymentMethod === "bank" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={styles.label}>🏦 {t.selectBank} *</label>
                  {bankAccounts.length === 0 ? (
                    <div style={{ padding: "10px 14px", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, fontSize: 13, color: "#92400e" }}>
                      ⚠️ {t.noBankAccounts}
                    </div>
                  ) : (
                    <select
                      value={selectedBankAccountId}
                      onChange={e => setSelectedBankAccountId(e.target.value)}
                      style={{ ...styles.input, cursor: "pointer" }}
                    >
                      <option value="">-- {t.selectBank} --</option>
                      {bankAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          🏦 {acc.bankName} | {acc.accountName} | {acc.accountNumber}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Note & Reference */}
              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>{t.paymentNote}</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  style={styles.input}
                  placeholder={lang === "si" ? "ගෙවීම් විස්තරය..." : "Payment description..."}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={styles.label}>{t.reference}</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  style={styles.input}
                  placeholder="Ref No / Cheque No"
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowPaymentModal(false)} style={styles.cancelBtn}>
                  {t.cancel}
                </button>
                <button
                  onClick={handlePayment}
                  disabled={isPaying || nn(paymentAmount) <= 0}
                  style={{
                    ...styles.saveBtn,
                    background: "linear-gradient(135deg,#16a34a,#15803d)",
                    opacity: (isPaying || nn(paymentAmount) <= 0) ? 0.6 : 1,
                  }}
                >
                  {isPaying ? "⏳..." : `💰 ${t.receiveNow}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREDIT MODAL ═══ */}
      {showCreditModal && creditCustomer && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: 420 }}>
            <div style={{ ...styles.modalHeader, paddingBottom: 10 }}>
              <h3 style={{ margin: 0, color: "#dc2626", fontSize: 18 }}>
                ➕ {t.addCreditTitle}
              </h3>
              <button onClick={() => setShowCreditModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={{ padding: "10px 0 20px" }}>
              <div style={{ marginBottom: 16, padding: 14, background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {creditCustomer.profilePicture ? (
                    <img
                      src={creditCustomer.profilePicture}
                      style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                      alt=""
                    />
                  ) : (
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "#dc2626",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontWeight: 700, fontSize: 16,
                    }}>
                      {(creditCustomer.name || "?").charAt(0)}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
                      {creditCustomer.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {creditCustomer.phone}
                    </div>
                  </div>
                </div>
                <div style={{
                  marginTop: 10, padding: "8px 12px", background: "white",
                  borderRadius: 8, border: "1px solid #fecaca",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 700 }}>
                    {t.currentBalance}:
                  </span>
                  <span style={{
                    fontSize: 18, fontWeight: 900,
                    color: nn(creditCustomer.currentBalance) < -0.01 ? "#2563eb" : "#dc2626",
                  }}>
                    {fmtMoney(nn(creditCustomer.currentBalance))}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={styles.label}>{t.creditAmount} *</label>
                <input
                  type="number"
                  autoFocus
                  placeholder="0.00"
                  value={creditAmount}
                  onChange={e => setCreditAmount(e.target.value)}
                  style={{
                    ...styles.input,
                    fontSize: 24, fontWeight: "bold",
                    color: "#dc2626", textAlign: "center", padding: 16,
                  }}
                />
                {nn(creditAmount) > 0 && (
                  <div style={{
                    marginTop: 8, padding: "8px 12px", background: "#fef2f2",
                    borderRadius: 8, border: "1px solid #fecaca",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{t.newBalance}:</span>
                    <span style={{ fontWeight: 800, color: "#dc2626", fontSize: 16 }}>
                      {fmtMoney(nn(creditCustomer.currentBalance) + nn(creditAmount))}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={styles.label}>{t.creditNote}</label>
                <input
                  type="text"
                  value={creditNote}
                  onChange={e => setCreditNote(e.target.value)}
                  style={styles.input}
                  placeholder={lang === "si" ? "භාණ්ඩ / සේවා විස්තරය..." : "Items / Services description..."}
                />
              </div>

              <div style={{
                marginBottom: 16, padding: "10px 14px", background: "#fffbeb",
                borderRadius: 10, border: "1px solid #fde68a", fontSize: 12, color: "#92400e",
              }}>
                ℹ️ {t.creditInfoMsg}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowCreditModal(false)} style={styles.cancelBtn}>
                  {t.cancel}
                </button>
                <button
                  onClick={handleAddCredit}
                  disabled={isAddingCredit || nn(creditAmount) <= 0}
                  style={{
                    ...styles.saveBtn,
                    background: "linear-gradient(135deg,#dc2626,#b91c1c)",
                    opacity: (isAddingCredit || nn(creditAmount) <= 0) ? 0.6 : 1,
                  }}
                >
                  {isAddingCredit ? "⏳..." : `➕ ${t.addCredit}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD CUSTOMER MODAL ═══ */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 18 }}>
                👤 {t.addNew}
              </h3>
              <button onClick={() => setShowModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleAddCustomer} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={styles.photoUpload} onClick={() => fileInputRef.current.click()}>
                  {newCustomer.profilePicture ? (
                    <img
                      src={newCustomer.profilePicture}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      alt=""
                    />
                  ) : (
                    <span>📷<br />{t.uploadPhoto}</span>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handlePhotoUpload}
                />
              </div>

              <button type="button" onClick={handleImportContact} style={styles.importBtn}>
                📒 {t.importContact}
              </button>

              <div>
                <label style={styles.label}>{t.name} *</label>
                <input
                  style={styles.input}
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  required
                  autoFocus
                  placeholder={lang === "si" ? "පාරිභෝගිකයාගේ නම" : "Customer name"}
                />
              </div>

              <div>
                <label style={styles.label}>{t.mobile} *</label>
                <div style={styles.phoneWrap}>
                  <span style={styles.phonePrefix}>+94</span>
                  <input
                    style={{ ...styles.input, border: "none", borderRadius: 0, paddingLeft: 8 }}
                    type="tel"
                    value={phoneSuffix}
                    onChange={e => setPhoneSuffix(e.target.value.replace(/\D/g, ""))}
                    placeholder="771234567"
                    required
                    maxLength={9}
                  />
                </div>
              </div>

              <div>
                <label style={styles.label}>{t.address}</label>
                <textarea
                  style={{ ...styles.input, height: 60, resize: "vertical" }}
                  value={newCustomer.address}
                  onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  placeholder={lang === "si" ? "ලිපිනය..." : "Address..."}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={styles.label}>📧 {t.email}</label>
                  <input
                    style={styles.input}
                    type="email"
                    value={newCustomer.email}
                    onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label style={styles.label}>🪪 {t.nic}</label>
                  <input
                    style={styles.input}
                    value={newCustomer.nic}
                    onChange={e => setNewCustomer({ ...newCustomer, nic: e.target.value })}
                    placeholder="NIC"
                  />
                </div>
              </div>

              <div>
                <label style={styles.label}>📝 {t.notes}</label>
                <textarea
                  style={{ ...styles.input, height: 50, resize: "vertical" }}
                  value={newCustomer.notes}
                  onChange={e => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                  placeholder={lang === "si" ? "සටහන්..." : "Notes..."}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{ ...styles.saveBtn, opacity: isSaving ? 0.6 : 1 }}
                >
                  {isSaving ? `⏳ ${t.adding}` : `💾 ${t.save}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   STYLES (unchanged from original)
════════════════════════════════════════ */
const styles = {
  container:         { padding: 20, maxWidth: 1400, margin: "0 auto", fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
  header:            { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  title:             { margin: 0, color: "#1e293b", fontSize: 24, fontWeight: 800 },
  addButton:         { padding: "10px 20px", background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "white", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(59,130,246,0.3)", whiteSpace: "nowrap" },
  exportBtn:         { width: 40, height: 40, borderRadius: 10, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" },
  statsGrid:         { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10, marginBottom: 16 },
  statCard:          { padding: "14px 16px", borderRadius: 14, border: "2px solid transparent" },
  filterRow:         { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center", background: "#f8fafc", padding: 14, borderRadius: 12, border: "1px solid #e2e8f0" },
  searchInput:       { padding: "11px 32px 11px 38px", borderRadius: 10, border: "2px solid #e2e8f0", flex: 1, minWidth: 200, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", background: "white" },
  clearSearchBtn:    { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8", padding: "2px 6px" },
  checkboxLabel:     { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none", background: "white", padding: "8px 14px", borderRadius: 10, border: "2px solid #e2e8f0", whiteSpace: "nowrap", transition: "all .15s" },
  sortSelect:        { padding: "10px 12px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 13, outline: "none", background: "white", cursor: "pointer", fontWeight: 500 },
  viewToggle:        { display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3 },
  viewBtn2:          { width: 36, height: 36, border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" },
  viewBtnOn:         { background: "white", boxShadow: "0 1px 3px rgba(0,0,0,.1)" },
  tableContainer:    { overflowX: "auto", borderRadius: 12, border: "1px solid #e2e8f0", background: "white" },
  table:             { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th:                { padding: "14px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 700, whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  tr:                { borderBottom: "1px solid #f1f5f9", transition: "background 0.15s", cursor: "default" },
  td:                { padding: "12px 12px", color: "#334155", verticalAlign: "middle" },
  avatarImg:         { width: 42, height: 42, borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "white", fontSize: 16 },
  viewBtn:           { padding: "7px 12px", background: "#e0f2fe", color: "#0284c7", border: "1px solid #bae6fd", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" },
  settledBadge:      { fontWeight: 600, color: "#16a34a", fontSize: 13, background: "#dcfce7", padding: "4px 12px", borderRadius: 20, display: "inline-block" },
  approvalBadge:     { display: "inline-block", marginTop: 4, padding: "2px 8px", backgroundColor: "#fff7ed", color: "#ea580c", border: "1px solid #fed7aa", borderRadius: 12, fontSize: 11, fontWeight: "bold" },
  quickActionBtn:    { width: 28, height: 28, borderRadius: 6, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  cardGrid:          { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 },
  customerCard:      { background: "white", borderRadius: 14, padding: 16, border: "1px solid #e2e8f0", borderLeft: "5px solid #16a34a", cursor: "pointer", transition: "all .15s", boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  cardActionBtn:     { padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 13 },
  pagination:        { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "14px 16px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", marginTop: 14 },
  pageBtn:           { padding: "7px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#475569" },
  pageNum:           { width: 34, height: 34, borderRadius: 6, border: "1px solid #e2e8f0", background: "white", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" },
  pageNumOn:         { background: "#3b82f6", color: "white", borderColor: "#3b82f6", fontWeight: 700 },
  modalOverlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modalContent:      { background: "white", padding: 28, borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" },
  modalHeader:       { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "2px solid #f1f5f9" },
  closeBtn:          { background: "#f1f5f9", border: "none", width: 34, height: 34, borderRadius: "50%", fontSize: 16, cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" },
  input:             { width: "100%", padding: 12, borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, boxSizing: "border-box", outline: "none", transition: "border .2s" },
  label:             { display: "block", marginBottom: 5, fontWeight: 700, fontSize: 13, color: "#475569" },
  phoneWrap:         { display: "flex", alignItems: "center", border: "2px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "white" },
  phonePrefix:       { padding: "10px 12px", background: "#f1f5f9", fontWeight: "bold", color: "#475569", fontSize: 14, borderRight: "2px solid #e2e8f0" },
  modalActions:      { display: "flex", gap: 12, marginTop: 20, paddingTop: 14, borderTop: "2px solid #f1f5f9" },
  cancelBtn:         { flex: 1, padding: 13, background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 },
  saveBtn:           { flex: 1, padding: 13, background: "linear-gradient(135deg,#10b981,#059669)", color: "white", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, boxShadow: "0 2px 8px rgba(16,185,129,.3)" },
  importBtn:         { width: "100%", padding: 12, background: "#e0f2fe", color: "#0369a1", border: "2px dashed #bae6fd", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 },
  photoUpload:       { width: 110, height: 110, borderRadius: "50%", background: "#f8fafc", border: "3px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", color: "#64748b", fontSize: 12, textAlign: "center", fontWeight: 600 },
};
// weerakkodi_pos_app/components/ExpenseManager.jsx
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/firebaseConfig";
import { useUserAuth } from "../context/UserContext";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  getDocs,
  Timestamp
} from "firebase/firestore";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const toNum = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const fmtC = (v) =>
  toNum(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
};

const normalizeHHMM = (val) => {
  if (!val) return "";
  if (typeof val === "string") {
    const m = val.match(/^(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  try {
    const d = val?.toDate
      ? val.toDate()
      : val?.seconds
      ? new Date(val.seconds * 1000)
      : new Date(val);
    if (!isNaN(d.getTime())) return d.toTimeString().slice(0, 5);
  } catch {}
  return "";
};

const buildLocalDateTime = (dateStr, timeStr) => {
  try {
    const sd = dateStr || todayISO();
    const st = normalizeHHMM(timeStr) || nowHHMM();
    const [y, m, d] = sd.split("-").map(Number);
    const [hh, mm] = st.split(":").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
    return isNaN(dt.getTime()) ? new Date() : dt;
  } catch {
    return new Date();
  }
};

const localTimestampFromInputs = (dateStr, timeStr) =>
  Timestamp.fromDate(buildLocalDateTime(dateStr, timeStr));

const tsMs = (ts) => {
  if (!ts) return 0;
  try {
    if (ts.seconds) return ts.seconds * 1000;
    if (ts.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

const getExpenseEventDate = (exp) => {
  if (exp?.date) return exp.date;
  const src = exp?.expenseTimestamp || exp?.timestamp || exp?.createdAt;
  if (!src) return todayISO();
  try {
    const d = src.toDate
      ? src.toDate()
      : src.seconds
      ? new Date(src.seconds * 1000)
      : new Date(src);
    if (isNaN(d.getTime())) return todayISO();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  } catch {
    return todayISO();
  }
};

const getExpenseEventTime = (exp) => {
  if (exp?.time) return normalizeHHMM(exp.time) || nowHHMM();
  return (
    normalizeHHMM(exp?.expenseTimestamp || exp?.timestamp || exp?.createdAt) ||
    nowHHMM()
  );
};

const getExpenseEventMs = (exp) => {
  if (!exp) return 0;
  if (exp.expenseTimestamp) return tsMs(exp.expenseTimestamp);
  return buildLocalDateTime(
    getExpenseEventDate(exp),
    getExpenseEventTime(exp)
  ).getTime();
};

const rangeStart = (f) => {
  const d = new Date();
  switch (f) {
    case "today":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case "yesterday":
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() - 1
      ).getTime();
    case "thisWeek": {
      const day = d.getDay();
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() - day + (day === 0 ? -6 : 1)
      ).getTime();
    }
    case "thisMonth":
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    case "lastMonth":
      return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    case "last3Months":
      return new Date(d.getFullYear(), d.getMonth() - 3, 1).getTime();
    case "thisYear":
      return new Date(d.getFullYear(), 0, 1).getTime();
    default:
      return 0;
  }
};

const rangeEnd = (f) => {
  const d = new Date();
  if (f === "yesterday")
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (f === "lastMonth")
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return Date.now() + 86400000;
};

const compressImage = (file, maxW = 400, quality = 0.6) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        let w = img.width,
          h = img.height;
        if (w > maxW) {
          h = (h * maxW) / w;
          w = maxW;
        }
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const out = c.toDataURL("image/jpeg", quality);
        c.width = 0;
        c.height = 0;
        resolve(out);
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

const mapExpenseToCashCategory = (cat) => {
  if (!cat) return "other";
  const l = cat.toLowerCase();
  if (l.includes("rent") || l.includes("කුලිය")) return "rent";
  if (
    l.includes("electric") ||
    l.includes("විදුලිය") ||
    l.includes("water") ||
    l.includes("ජලය") ||
    l.includes("phone") ||
    l.includes("දුරකථන") ||
    l.includes("internet") ||
    l.includes("ඉන්ටර්නෙට්")
  )
    return "utilities";
  if (l.includes("salary") || l.includes("වැටුප්")) return "salary";
  if (
    l.includes("transport") ||
    l.includes("ප්‍රවාහනය") ||
    l.includes("travel") ||
    l.includes("ගමන්")
  )
    return "transport";
  if (
    l.includes("fuel") ||
    l.includes("petrol") ||
    l.includes("ඉන්ධන")
  )
    return "petrolExpense";
  if (l.includes("food") || l.includes("ආහාර")) return "foodExpense";
  if (l.includes("office") || l.includes("කාර්යාල")) return "officeExpense";
  if (
    l.includes("repair") ||
    l.includes("maintenance") ||
    l.includes("අලුත්වැඩියා") ||
    l.includes("cleaning") ||
    l.includes("පිරිසිදු")
  )
    return "maintenance";
  if (l.includes("purchase") || l.includes("packaging") || l.includes("ඇසුරුම්"))
    return "purchase";
  return "other";
};

const getItemImageUrl = (item) => {
  if (!item) return null;
  if (item.itemImage) return item.itemImage;
  if (
    item.picture &&
    typeof item.picture === "string" &&
    item.picture.length > 20
  )
    return item.picture;
  if (
    Array.isArray(item.images) &&
    item.images.length > 0 &&
    typeof item.images[0] === "string" &&
    item.images[0].length > 20
  )
    return item.images[0];
  if (item.photoURL) return item.photoURL;
  return null;
};

const summarizeExpenseItems = (items = [], limit = 3) => {
  if (!Array.isArray(items) || !items.length) return "";
  const parts = items
    .filter((i) => i?.itemName)
    .slice(0, limit)
    .map((i) => `${i.itemName} x${toNum(i.qty || 1)}`);
  const extra = items.length > limit ? ` +${items.length - limit}` : "";
  return `${parts.join(", ")}${extra}`;
};

const buildCashTxFromExpense = (expData, expId, email, bankInfo = null) => {
  const catLabel = (expData.category || "Expense").split("/")[0].trim();
  const itemSum = summarizeExpenseItems(expData.expenseItems || []);
  const desc = expData.description
    ? `${catLabel} - ${expData.description}`
    : itemSum
    ? `${catLabel} - ${itemSum}`
    : catLabel;
  const sd = expData.date || todayISO();
  const st = normalizeHHMM(expData.time) || nowHHMM();
  const ts = localTimestampFromInputs(sd, st);
  const noteParts = [];
  if (expData.notes) noteParts.push(`📝 ${expData.notes}`);
  if (itemSum) noteParts.push(`📦 ${itemSum}`);
  if (expData.expenseBy) noteParts.push(`👤 ${expData.expenseBy}`);
  if (!noteParts.length) noteParts.push(expData.category || "");
  return {
    type: "out",
    category: mapExpenseToCashCategory(expData.category),
    description: desc,
    amount: toNum(expData.amount),
    paymentMethod: expData.paymentMethod || "cash",
    timestamp: ts,
    date: sd,
    time: st,
    source: "expense",
    isAutomatic: true,
    expenseId: expId,
    reference: expData.reference || "",
    notes: noteParts.join(" | "),
    receiptNo: "",
    createdAt: Timestamp.now(),
    createdBy: email || "Unknown",
    bankAccountId: expData.bankAccountId || "",
    bankAccountName: bankInfo
      ? `${bankInfo.bankName || ""}${
          bankInfo.accountName ? ` - ${bankInfo.accountName}` : ""
        }`
      : "",
    bankName: bankInfo?.bankName || "",
    accountNumber: bankInfo?.accountNumber || "",
    expenseBy: expData.expenseBy || "",
    supplierId: expData.expenseBySupplierId || "",
    expenseItems: expData.expenseItems || [],
  };
};

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */
const defaultCategories = [
  { name: "කුලිය / Rent", icon: "🏠", color: "#ef4444" },
  { name: "විදුලිය / Electricity", icon: "⚡", color: "#f59e0b" },
  { name: "ජලය / Water", icon: "💧", color: "#3b82f6" },
  { name: "ප්‍රවාහනය / Transport", icon: "🚗", color: "#8b5cf6" },
  { name: "දුරකථන / Phone", icon: "📱", color: "#06b6d4" },
  { name: "ඉන්ටර්නෙට් / Internet", icon: "🌐", color: "#6366f1" },
  { name: "වැටුප් / Salary", icon: "👷", color: "#ec4899" },
  { name: "ආහාර / Food", icon: "🍽️", color: "#f97316" },
  { name: "අලුත්වැඩියා / Repairs", icon: "🔧", color: "#14b8a6" },
  { name: "ඇසුරුම් / Packaging", icon: "📦", color: "#a855f7" },
  { name: "ප්‍රචාරණය / Marketing", icon: "📢", color: "#e11d48" },
  { name: "රක්ෂණ / Insurance", icon: "🛡️", color: "#0ea5e9" },
  { name: "බදු / Tax", icon: "🏛️", color: "#dc2626" },
  { name: "පිරිසිදු කිරීම / Cleaning", icon: "🧹", color: "#10b981" },
  { name: "කාර්යාල උපකරණ / Office", icon: "🖨️", color: "#64748b" },
  { name: "ඉන්ධන / Fuel", icon: "⛽", color: "#d97706" },
  { name: "ඖෂධ / Medicine", icon: "💊", color: "#059669" },
  { name: "ගමන් / Travel", icon: "✈️", color: "#7c3aed" },
  { name: "අධ්‍යාපන / Education", icon: "📚", color: "#2563eb" },
  { name: "වෙනත් / Other", icon: "📋", color: "#94a3b8" },
];

const paymentMethods = [
  { value: "cash", label: "💵 මුදල්", en: "Cash", icon: "💵", needsBank: false },
  {
    value: "bank",
    label: "🏦 බැංකු",
    en: "Bank Transfer",
    icon: "🏦",
    needsBank: true,
  },
  { value: "card", label: "💳 කාඩ්", en: "Card", icon: "💳", needsBank: true },
  {
    value: "cheque",
    label: "📝 චෙක්",
    en: "Cheque",
    icon: "📝",
    needsBank: true,
  },
  {
    value: "online",
    label: "📱 Online",
    en: "Online",
    icon: "📱",
    needsBank: true,
  },
];

const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' fill='%2394a3b8' font-size='24'%3E📦%3C/text%3E%3C/svg%3E";

const createEmptyExpenseItem = () => ({
  itemId: "",
  itemName: "",
  qty: "1",
  unitPrice: "",
  unit: "",
  itemImage: "",
});

const createInitialFormData = () => ({
  category: "",
  amount: "",
  description: "",
  date: todayISO(),
  time: nowHHMM(),
  paymentMethod: "cash",
  receipt: null,
  notes: "",
  reference: "",
  recurring: "none",
  expenseBy: "",
  expenseBySupplierId: "",
  bankAccountId: "",
  expenseItems: [],
});

/* ═══════════════════════════════════════════════════════════════
   TRANSLATIONS
   ═══════════════════════════════════════════════════════════════ */
const T = {
  si: {
    title: "වියදම් කළමනාකරණය",
    addExpense: "නව වියදමක්",
    editExpense: "වියදම සංස්කරණය",
    category: "වර්ගය",
    amount: "මුදල",
    date: "දිනය",
    time: "වේලාව",
    description: "විස්තරය",
    paymentMethod: "ගෙවීම් ක්‍රමය",
    receipt: "රිසිට්පත",
    save: "සුරකින්න",
    update: "යාවත්කාලීන",
    cancel: "අවලංගු",
    delete: "මකන්න",
    deleteConfirm: "මෙම වියදම මකා දැමීමට අවශ්‍යද?",
    deleted: "මකා දමන ලදී!",
    saved: "සාර්ථකයි!",
    updated: "යාවත්කාලීන විය!",
    noExpenses: "වියදම් නොමැත",
    loading: "පූරණය වෙමින්...",
    today: "අද",
    yesterday: "ඊයේ",
    thisWeek: "සතිය",
    thisMonth: "මාසය",
    lastMonth: "පසු මාසය",
    last3Months: "මාස 3",
    thisYear: "මේ වසර",
    allTime: "සමස්ත",
    totalExpenses: "මුළු වියදම්",
    avgExpense: "සාමාන්‍ය",
    highestExpense: "උපරිම",
    lowestExpense: "අවම",
    dailyAvg: "දිනකට සාමාන්‍ය",
    search: "සොයන්න...",
    categoryName: "වර්ග නම",
    manageCategories: "වර්ග කළමනාකරණය",
    attachReceipt: "රිසිට්පත එක් කරන්න",
    viewReceipt: "රිසිට්පත බලන්න",
    notes: "සටහන්",
    expenseBy: "Expense By / Supplier",
    reference: "යොමු අංකය",
    saving: "සුරකිමින්...",
    categoryBreakdown: "වර්ග අනුව",
    all: "සියල්ල",
    amountRequired: "මුදල ඇතුළත් කරන්න",
    categoryRequired: "වර්ගය තෝරන්න",
    exportCSV: "CSV බාගන්න",
    print: "මුද්‍රණය",
    list: "ලැයිස්තුව",
    analytics: "විශ්ලේෂණ",
    paymentBreakdown: "ගෙවීම් අනුව",
    entries: "ඇතුළත් කිරීම්",
    noCategory: "වර්ගයක් නැත",
    catAdded: "වර්ගය එක් විය!",
    catDeleted: "වර්ගය මකා දැමිණි!",
    confirmDeleteCat: "මෙම වර්ගය මකන්නද?",
    imgTooBig: "5MB ට වඩා විශාලයි",
    imgError: "පින්තූරය process කළ නොහැක",
    from: "සිට",
    to: "දක්වා",
    customRange: "අභිරුචි දින",
    clearFilters: "පෙරහන් ඉවත්",
    sortNewest: "අලුත්ම",
    sortOldest: "පැරණිම",
    sortHighest: "වැඩිම",
    sortLowest: "අඩුම",
    duplicateExpense: "අනුපිටපත්",
    duplicated: "අනුපිටපත් විය!",
    syncInfo: "Cash Management සමඟ සමමුහුර්ත වේ",
    selectBank: "බැංකු ගිණුම තෝරන්න",
    bankAccount: "බැංකු ගිණුම",
    bankRequired: "බැංකු ගිණුමක් තෝරන්න",
    noBankAccounts: "බැංකු ගිණුම් නොමැත.",
    bankAutoDeduct: "බැංකු ශේෂයෙන් ස්වයංක්‍රීයව අඩු වේ",
    viewCashManagement: "මුදල් කළමනාකරණය බලන්න",
    cashManagementInfo: "සියලු ගනුදෙනු එකම තැනකින්",
    fixOldTimes: "🔧 පැරණි වේලාවන් Fix",
    fixingTimes: "Fix කරමින්...",
    fixComplete: "Fix අවසන්!",
    fixedCount: "records fix විය",
    noFixNeeded: "Fix කළ යුතු records නැත",
    expenseItems: "වියදම් භාණ්ඩ",
    expenseItemsDesc:
      "භාණ්ඩ එකතු කළොත් මුළු මුදල ස්වයංක්‍රීයව ගණනය වේ.",
    addItem: "භාණ්ඩයක් එක් කරන්න",
    removeItem: "ඉවත් කරන්න",
    itemName: "භාණ්ඩ නම",
    selectItem: "භාණ්ඩය තෝරන්න",
    searchItem: "භාණ්ඩය සොයන්න...",
    qty: "ප්‍රමාණය",
    unitPrice: "ඒකක මිල",
    lineTotal: "එකතුව",
    itemsTotal: "භාණ්ඩ මුළු එකතුව",
    amountFromItems: "භාණ්ඩවල එකතුව අනුව මුදල ස්වයංක්‍රීයව සැකසේ",
    manualAmount: "Manual Amount",
    supplierPicker: "සැපයුම්කරු තෝරන්න",
    selectSupplier: "සැපයුම්කරු තෝරන්න",
    createSupplier: "නව සැපයුම්කරු",
    supplierName: "සැපයුම්කරු නම",
    companyName: "ආයතනයේ නම",
    phone: "දුරකථන",
    saveSupplier: "සැපයුම්කරු සුරකින්න",
    supplierSaved: "සැපයුම්කරු සාර්ථකව එක් විය!",
    supplierRequired: "සැපයුම්කරු නම අවශ්‍යයි",
    noSuppliers: "සැපයුම්කරුවන් නොමැත",
    chooseSupplier: "Supplier තෝරන්න / Create කරන්න",
    clearSupplier: "Supplier ඉවත් කරන්න",
    supplierSearch: "සැපයුම්කරු සොයන්න...",
    noMatchingSuppliers: "ගැලපෙන සැපයුම්කරුවන් නොමැත",
    clickExpenseBy: "Click කර supplier select / create කරන්න",
    selected: "තෝරාගෙන ඇත",
    noMatchingItems: "ගැලපෙන භාණ්ඩ නොමැත",
    orTypeManually: "හෝ අතින් ටයිප් කරන්න",
    noItemsInInventory: "භාණ්ඩ ලියාපදිංචි නොමැත",
    buyingPrice: "ගැනුම් මිල",
    stock: "තොග",
  },
  en: {
    title: "Expense Manager",
    addExpense: "New Expense",
    editExpense: "Edit Expense",
    category: "Category",
    amount: "Amount",
    date: "Date",
    time: "Time",
    description: "Description",
    paymentMethod: "Payment Method",
    receipt: "Receipt",
    save: "Save",
    update: "Update",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirm: "Delete this expense?",
    deleted: "Deleted!",
    saved: "Saved!",
    updated: "Updated!",
    noExpenses: "No expenses found",
    loading: "Loading...",
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "Week",
    thisMonth: "Month",
    lastMonth: "Last Month",
    last3Months: "3 Months",
    thisYear: "This Year",
    allTime: "All",
    totalExpenses: "Total Expenses",
    avgExpense: "Average",
    highestExpense: "Highest",
    lowestExpense: "Lowest",
    dailyAvg: "Daily Avg",
    search: "Search...",
    categoryName: "Category Name",
    manageCategories: "Manage Categories",
    attachReceipt: "Attach Receipt",
    viewReceipt: "View Receipt",
    notes: "Notes",
    expenseBy: "Expense By / Supplier",
    reference: "Reference",
    saving: "Saving...",
    categoryBreakdown: "By Category",
    all: "All",
    amountRequired: "Enter amount",
    categoryRequired: "Select category",
    exportCSV: "Export CSV",
    print: "Print",
    list: "List",
    analytics: "Analytics",
    paymentBreakdown: "By Payment",
    entries: "Entries",
    noCategory: "No Category",
    catAdded: "Category added!",
    catDeleted: "Category deleted!",
    confirmDeleteCat: "Delete this category?",
    imgTooBig: "File exceeds 5MB",
    imgError: "Cannot process image",
    from: "From",
    to: "To",
    customRange: "Custom Range",
    clearFilters: "Clear Filters",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    sortHighest: "Highest",
    sortLowest: "Lowest",
    duplicateExpense: "Duplicate",
    duplicated: "Duplicated!",
    syncInfo: "Syncs with Cash Management",
    selectBank: "Select Bank Account",
    bankAccount: "Bank Account",
    bankRequired: "Please select a bank account",
    noBankAccounts: "No bank accounts found.",
    bankAutoDeduct: "Will auto-deduct from bank balance",
    viewCashManagement: "View Cash Management",
    cashManagementInfo: "All transactions in one place",
    fixOldTimes: "🔧 Fix Old Times",
    fixingTimes: "Fixing...",
    fixComplete: "Fix complete!",
    fixedCount: "records fixed",
    noFixNeeded: "No records need fixing",
    expenseItems: "Expense Items",
    expenseItemsDesc: "Add items and total will be calculated automatically.",
    addItem: "Add Item",
    removeItem: "Remove",
    itemName: "Item Name",
    selectItem: "Select Item",
    searchItem: "Search item...",
    qty: "Qty",
    unitPrice: "Unit Price",
    lineTotal: "Line Total",
    itemsTotal: "Items Total",
    amountFromItems: "Amount auto-calculated from items",
    manualAmount: "Manual Amount",
    supplierPicker: "Select Supplier",
    selectSupplier: "Select Supplier",
    createSupplier: "New Supplier",
    supplierName: "Supplier Name",
    companyName: "Company Name",
    phone: "Phone",
    saveSupplier: "Save Supplier",
    supplierSaved: "Supplier added!",
    supplierRequired: "Supplier name is required",
    noSuppliers: "No suppliers found",
    chooseSupplier: "Select / Create Supplier",
    clearSupplier: "Clear Supplier",
    supplierSearch: "Search supplier...",
    noMatchingSuppliers: "No matching suppliers",
    clickExpenseBy: "Click to select / create supplier",
    selected: "Selected",
    noMatchingItems: "No matching items",
    orTypeManually: "or type manually",
    noItemsInInventory: "No items registered",
    buyingPrice: "Buying Price",
    stock: "Stock",
  },
};

/* ═══════════════════════════════════════════════════════════════
   ITEM SEARCH DROPDOWN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function ItemSearchDropdown({
  inventoryItems,
  value,
  onSelect,
  onNameChange,
  currentName,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return inventoryItems.slice(0, 50);
    const terms = s.split(/\s+/);
    return inventoryItems
      .filter((it) => {
        const hay =
          `${it.name || ""} ${it.sinhalaName || ""} ${it.itemCode || ""} ${
            it.barcode || ""
          } ${it.brandName || ""} ${it.categoryName || ""}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      })
      .slice(0, 50);
  }, [inventoryItems, search]);

  const handleSelect = (item) => {
    onSelect(item);
    setSearch("");
    setOpen(false);
  };

  const handleInputFocus = () => {
    setSearch("");
    setOpen(true);
  };

  const selectedItem = value
    ? inventoryItems.find((it) => it.id === value)
    : null;
  const imgUrl = selectedItem ? getItemImageUrl(selectedItem) : null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {selectedItem ? (
        <div style={S.selectedItemCard}>
          <div style={S.selectedItemLeft}>
            <img
              src={imgUrl || PLACEHOLDER_IMG}
              alt=""
              style={S.selectedItemImg}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = PLACEHOLDER_IMG;
              }}
            />
            <div>
              <div
                style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}
              >
                {selectedItem.name}
              </div>
              {selectedItem.sinhalaName && (
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {selectedItem.sinhalaName}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#94a3b8" }}>
                {selectedItem.itemCode}
                {selectedItem.brandName
                  ? ` • ${selectedItem.brandName}`
                  : ""}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              onSelect(null);
              setSearch("");
            }}
            style={S.clearItemBtn}
          >
            ✕
          </button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            value={open ? search : currentName || ""}
            onChange={(e) => {
              if (open) setSearch(e.target.value);
              else onNameChange(e.target.value);
            }}
            onFocus={handleInputFocus}
            placeholder={`🔍 ${t.searchItem}`}
            style={S.inpSm}
          />
          {!open && (
            <button
              onClick={() => {
                setOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              style={S.dropdownToggle}
            >
              ▼
            </button>
          )}
        </div>
      )}

      {open && !selectedItem && (
        <div style={S.itemDropdown}>
          <div style={S.itemDropdownSearch}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`🔍 ${t.searchItem}`}
              style={S.itemDropdownInput}
            />
          </div>
          <div style={S.itemDropdownList}>
            {filtered.length === 0 ? (
              <div style={S.itemDropdownEmpty}>
                <span style={{ fontSize: 24 }}>🔍</span>
                <div>
                  {search ? t.noMatchingItems : t.noItemsInInventory}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {t.orTypeManually}
                </div>
              </div>
            ) : (
              filtered.map((item) => {
                const img = getItemImageUrl(item);
                const stock = toNum(item.stock || 0);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    style={S.itemDropdownRow}
                  >
                    <img
                      src={img || PLACEHOLDER_IMG}
                      alt=""
                      style={S.itemDropdownImg}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = PLACEHOLDER_IMG;
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.name}
                      </div>
                      {item.sinhalaName && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#64748b",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.sinhalaName}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 10,
                          color: "#94a3b8",
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginTop: 2,
                        }}
                      >
                        <span>{item.itemCode}</span>
                        {item.brandName && (
                          <span>• {item.brandName}</span>
                        )}
                        {item.uomName && <span>• {item.uomName}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {item.buyingPrice !== undefined &&
                        toNum(item.buyingPrice) > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#059669",
                            }}
                          >
                            Rs.{fmtC(item.buyingPrice)}
                          </div>
                        )}
                      <div
                        style={{
                          fontSize: 10,
                          color: stock > 0 ? "#16a34a" : "#dc2626",
                          fontWeight: 600,
                          marginTop: 2,
                        }}
                      >
                        {t.stock}: {stock}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
function ExpenseManager({ lang = "si" }) {
  const t = T[lang] || T.si;
  const { user } = useUserAuth();
  // ── Next.js: useRouter replaces useNavigate ──
  const router = useRouter();

  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([...defaultCategories]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);

  const [mainTab, setMainTab] = useState("list");
  const [dateFilter, setDateFilter] = useState("thisMonth");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(createInitialFormData());
  const [viewReceipt, setViewReceipt] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [fixing, setFixing] = useState(false);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showNewSupplierBox, setShowNewSupplierBox] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    companyName: "",
    phone: "",
  });

  const fileRef = useRef(null);
  const printRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const cashTxCollection = user
    ? `users/${user.uid}/cashTransactions`
    : null;

  const selectedPaymentMethod = paymentMethods.find(
    (p) => p.value === formData.paymentMethod
  );
  const needsBankAccount = selectedPaymentMethod?.needsBank || false;

  const activeBankAccounts = useMemo(
    () => bankAccounts.filter((a) => a.isActive !== false),
    [bankAccounts]
  );

  const selectedBankAccount = useMemo(
    () =>
      formData.bankAccountId
        ? bankAccounts.find((a) => a.id === formData.bankAccountId) || null
        : null,
    [formData.bankAccountId, bankAccounts]
  );

  const normalizedExpenseItems = useMemo(() => {
    return (formData.expenseItems || [])
      .map((r) => {
        const name = (r.itemName || "").trim();
        const qty = toNum(r.qty || 1) || 1;
        const up = toNum(r.unitPrice || 0);
        if (!name && !r.itemId && !up) return null;
        return {
          itemId: r.itemId || "",
          itemName: name,
          qty,
          unitPrice: up,
          unit: r.unit || "",
          lineTotal: qty * up,
          itemImage: r.itemImage || "",
        };
      })
      .filter(Boolean);
  }, [formData.expenseItems]);

  const expenseItemsTotal = useMemo(
    () =>
      normalizedExpenseItems.reduce((s, r) => s + toNum(r.lineTotal), 0),
    [normalizedExpenseItems]
  );

  const hasItemizedExpense = normalizedExpenseItems.length > 0;

  const supplierListFiltered = useMemo(() => {
    const s = supplierSearch.trim().toLowerCase();
    if (!s) return suppliers;
    return suppliers.filter((sup) =>
      `${sup.name || ""} ${sup.companyName || ""} ${sup.phone || ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [suppliers, supplierSearch]);

  // ═══════ LOAD DATA ═══════
  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setBankAccounts([]);
      setSuppliers([]);
      setInventoryItems([]);
      setLoading(false);
      return;
    }

    const unsubExp = onSnapshot(
      query(
        collection(db, "expenses"),
        where("uid", "==", user.uid)
      ),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort(
          (a, b) => getExpenseEventMs(b) - getExpenseEventMs(a)
        );
        setExpenses(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubCats = onSnapshot(
      query(
        collection(db, "expenseCategories"),
        where("uid", "==", user.uid)
      ),
      (snap) => {
        const custom = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setCategories([
          ...defaultCategories,
          ...custom.map((c) => ({
            name: c.name,
            icon: c.icon || "📋",
            color: c.color || "#64748b",
            id: c.id,
            isCustom: true,
          })),
        ]);
      }
    ,
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubBanks = onSnapshot(
      collection(db, `users/${user.uid}/bankAccounts`),
      (snap) =>
        setBankAccounts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        )
    ,
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubSup = onSnapshot(
      query(collection(db, "suppliers"), where("uid", "==", user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setSuppliers(list);
      }
    ,
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    const unsubItems = onSnapshot(
      query(collection(db, "items"), where("uid", "==", user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setInventoryItems(list);
      }
    ,
    (error) => {
      console.warn("⚠️ Firestore listener error:", error?.code, error?.message);
      if (error?.code === "resource-exhausted") {
        console.warn("📊 Quota exceeded — offline data පමණක් භාවිතා වේ");
      }
    }
  );

    return () => {
      unsubExp();
      unsubCats();
      unsubBanks();
      unsubSup();
      unsubItems();
    };
  }, [user]);

  // ═══════ FIX OLD TIMES ═══════
  const handleFixOldTimes = async () => {
    if (!user || !cashTxCollection) return;
    if (
      !window.confirm(
        lang === "si"
          ? "පැරණි cashTransaction records වල time නිවැරදි කරන්නද?"
          : "Fix time in old cashTransaction records?"
      )
    )
      return;
    setFixing(true);
    let fixedCount = 0;
    try {
      const expSnap = await getDocs(
        query(
          collection(db, "expenses"),
          where("uid", "==", user.uid)
        )
      );
      const expMap = {};
      expSnap.docs.forEach((d) => {
        const e = d.data();
        const cd = e.date || todayISO();
        const ct = normalizeHHMM(e.time) || nowHHMM();
        expMap[d.id] = {
          date: cd,
          time: ct,
          timestamp:
            e.expenseTimestamp || localTimestampFromInputs(cd, ct),
        };
      });

      const cashSnap = await getDocs(
        query(
          collection(db, cashTxCollection),
          where("source", "==", "expense")
        )
      );

      if (cashSnap.empty) {
        showToast(`ℹ️ ${t.noFixNeeded}`);
        setFixing(false);
        return;
      }

      for (const cd of cashSnap.docs) {
        const data = cd.data();
        const eid = data.expenseId;
        if (!eid || !expMap[eid]) continue;
        if (
          data.date === expMap[eid].date &&
          data.time === expMap[eid].time
        )
          continue;
        await updateDoc(doc(db, cashTxCollection, cd.id), {
          date: expMap[eid].date,
          time: expMap[eid].time,
          timestamp: expMap[eid].timestamp,
          updatedAt: Timestamp.now(),
        });
        fixedCount++;
      }

      showToast(
        fixedCount > 0
          ? `✅ ${t.fixComplete} ${fixedCount} ${t.fixedCount}`
          : `ℹ️ ${t.noFixNeeded}`
      );
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
    setFixing(false);
  };

  // ═══════ HELPERS ═══════
  const getCatInfo = useCallback(
    (n) =>
      categories.find((c) => c.name === n) || {
        name: n,
        icon: "📋",
        color: "#94a3b8",
      },
    [categories]
  );

  const getBankAccountLabel = useCallback(
    (bid) => {
      if (!bid) return "";
      const a = bankAccounts.find((b) => b.id === bid);
      return a
        ? `${a.bankName || ""}${
            a.accountName ? ` - ${a.accountName}` : ""
          }`
        : "";
    },
    [bankAccounts]
  );

  // ═══════ CATEGORY CRUD ═══════
  const handleAddCategory = async () => {
    if (!newCatName.trim() || !user) return;
    try {
      await addDoc(collection(db, "expenseCategories"), {
        uid: user.uid,
        name: newCatName.trim(),
        icon: "📋",
        color: "#64748b",
        createdAt: serverTimestamp(),
      });
      setNewCatName("");
      showToast(`✅ ${t.catAdded}`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm(t.confirmDeleteCat)) return;
    try {
      await deleteDoc(doc(db, "expenseCategories", id));
      showToast(`✅ ${t.catDeleted}`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
  };

  // ═══════ RECEIPT ═══════
  const handleReceipt = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      showToast(`⚠️ ${t.imgTooBig}`);
      return;
    }
    const c = await compressImage(f, 400, 0.6);
    if (c) setFormData((p) => ({ ...p, receipt: c }));
    else showToast(`❌ ${t.imgError}`);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ═══════ SUPPLIER PICKER ═══════
  const openSupplierPicker = () => {
    setSupplierSearch("");
    setShowNewSupplierBox(false);
    setNewSupplier({ name: "", companyName: "", phone: "" });
    setShowSupplierModal(true);
  };

  const handleSelectSupplier = (sup) => {
    setFormData((p) => ({
      ...p,
      expenseBy: sup?.name || "",
      expenseBySupplierId: sup?.id || "",
    }));
    setShowSupplierModal(false);
  };

  const handleClearSupplier = () =>
    setFormData((p) => ({
      ...p,
      expenseBy: "",
      expenseBySupplierId: "",
    }));

  const handleCreateSupplier = async () => {
    if (!user) return;
    if (!newSupplier.name.trim()) {
      showToast(`⚠️ ${t.supplierRequired}`);
      return;
    }
    setCreatingSupplier(true);
    try {
      const payload = {
        uid: user.uid,
        name: newSupplier.name.trim(),
        companyName: newSupplier.companyName.trim(),
        phone: newSupplier.phone.trim(),
        email: "",
        city: "",
        address: "",
        openingBalance: 0,
        balance: 0,
        currentBalance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "suppliers"), payload);
      setFormData((p) => ({
        ...p,
        expenseBy: payload.name,
        expenseBySupplierId: ref.id,
      }));
      setShowSupplierModal(false);
      setShowNewSupplierBox(false);
      setNewSupplier({ name: "", companyName: "", phone: "" });
      showToast(`✅ ${t.supplierSaved}`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    } finally {
      setCreatingSupplier(false);
    }
  };

  // ═══════ EXPENSE ITEMS ═══════
  const addExpenseItemRow = () =>
    setFormData((p) => ({
      ...p,
      expenseItems: [
        ...(p.expenseItems || []),
        createEmptyExpenseItem(),
      ],
    }));

  const removeExpenseItemRow = (i) =>
    setFormData((p) => ({
      ...p,
      expenseItems: (p.expenseItems || []).filter((_, j) => j !== i),
    }));

  const updateExpenseItemRow = (i, patch) =>
    setFormData((p) => ({
      ...p,
      expenseItems: (p.expenseItems || []).map((r, j) =>
        j === i ? { ...r, ...patch } : r
      ),
    }));

  const handleSelectInventoryItem = (idx, item) => {
    if (!item) {
      updateExpenseItemRow(idx, {
        itemId: "",
        itemName: "",
        unit: "",
        itemImage: "",
      });
      return;
    }
    const img = getItemImageUrl(item);
    updateExpenseItemRow(idx, {
      itemId: item.id,
      itemName: item.name || "",
      unitPrice:
        item.buyingPrice !== undefined && item.buyingPrice !== null
          ? String(item.buyingPrice)
          : "",
      unit: item.uomName || "",
      itemImage: img || "",
    });
  };

  // ═══════ CASH SYNC ═══════
  const syncExpenseToCash = async (expData, expId, action = "add") => {
    if (!cashTxCollection || !user) return;
    const bankInfo = expData?.bankAccountId
      ? bankAccounts.find((a) => a.id === expData.bankAccountId) || null
      : null;
    try {
      if (action === "add") {
        await addDoc(
          collection(db, cashTxCollection),
          buildCashTxFromExpense(expData, expId, user.email, bankInfo)
        );
      } else if (action === "update") {
        const q = query(
          collection(db, cashTxCollection),
          where("expenseId", "==", expId),
          where("source", "==", "expense")
        );
        const snap = await getDocs(q);
        const txData = buildCashTxFromExpense(
          expData,
          expId,
          user.email,
          bankInfo
        );
        delete txData.createdAt;
        txData.updatedAt = Timestamp.now();
        if (!snap.empty)
          await updateDoc(
            doc(db, cashTxCollection, snap.docs[0].id),
            txData
          );
        else
          await addDoc(collection(db, cashTxCollection), {
            ...txData,
            createdAt: Timestamp.now(),
          });
      } else if (action === "delete") {
        const q = query(
          collection(db, cashTxCollection),
          where("expenseId", "==", expId),
          where("source", "==", "expense")
        );
        const snap = await getDocs(q);
        await Promise.all(
          snap.docs.map((d) =>
            deleteDoc(doc(db, cashTxCollection, d.id))
          )
        );
      }
    } catch (err) {
      console.warn(`Cash sync [${action}]:`, err.message);
    }
  };

  // ═══════ FORM ═══════
  const resetForm = () => {
    setFormData(createInitialFormData());
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (exp) => {
    setFormData({
      category: exp.category || "",
      amount:
        exp.amount !== undefined ? String(exp.amount) : "",
      description: exp.description || "",
      date: exp.date || getExpenseEventDate(exp),
      time: normalizeHHMM(exp.time) || getExpenseEventTime(exp),
      paymentMethod: exp.paymentMethod || "cash",
      receipt: exp.receipt || null,
      notes: exp.notes || "",
      reference: exp.reference || "",
      recurring: exp.recurring || "none",
      expenseBy: exp.expenseBy || "",
      expenseBySupplierId: exp.expenseBySupplierId || "",
      bankAccountId: exp.bankAccountId || "",
      expenseItems: Array.isArray(exp.expenseItems)
        ? exp.expenseItems.map((r) => ({
            itemId: r.itemId || "",
            itemName: r.itemName || "",
            qty: String(r.qty ?? 1),
            unitPrice: String(r.unitPrice ?? ""),
            unit: r.unit || "",
            itemImage: r.itemImage || "",
          }))
        : [],
    });
    setEditingId(exp.id);
    setShowForm(true);
  };

  // ═══════ SAVE ═══════
  const handleSave = async () => {
    if (!formData.category) {
      showToast(`⚠️ ${t.categoryRequired}`);
      return;
    }
    const finalAmount = hasItemizedExpense
      ? expenseItemsTotal
      : toNum(formData.amount);
    if (!finalAmount || finalAmount <= 0) {
      showToast(`⚠️ ${t.amountRequired}`);
      return;
    }
    if (needsBankAccount && !formData.bankAccountId) {
      showToast(`⚠️ ${t.bankRequired}`);
      return;
    }
    setSaving(true);
    try {
      const cleanItems = normalizedExpenseItems;
      const sd = formData.date || todayISO();
      const st = normalizeHHMM(formData.time) || nowHHMM();
      const autoDesc =
        !formData.description && cleanItems.length
          ? summarizeExpenseItems(cleanItems, 5)
          : formData.description || "";
      const data = {
        uid: user.uid,
        category: formData.category,
        amount: finalAmount,
        description: autoDesc,
        date: sd,
        time: st,
        expenseTimestamp: localTimestampFromInputs(sd, st),
        paymentMethod: formData.paymentMethod,
        receipt: formData.receipt || null,
        notes: formData.notes || "",
        reference: formData.reference || "",
        recurring: formData.recurring || "none",
        expenseBy: formData.expenseBy || "",
        expenseBySupplierId: formData.expenseBySupplierId || "",
        bankAccountId: needsBankAccount
          ? formData.bankAccountId || ""
          : "",
        expenseItems: cleanItems,
        expenseItemsCount: cleanItems.length,
        amountSource: cleanItems.length ? "items" : "manual",
      };
      if (editingId) {
        await updateDoc(doc(db, "expenses", editingId), {
          ...data,
          updatedAt: serverTimestamp(),
        });
        await syncExpenseToCash(data, editingId, "update");
        showToast(`✅ ${t.updated}`);
      } else {
        const ref = await addDoc(collection(db, "expenses"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        await syncExpenseToCash(data, ref.id, "add");
        showToast(`✅ ${t.saved}`);
      }
      resetForm();
    } catch (e) {
      showToast(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (exp) => {
    try {
      const dd = todayISO();
      const dt = nowHHMM();
      const data = {
        uid: user.uid,
        category: exp.category,
        amount: toNum(exp.amount),
        description: exp.description || "",
        date: dd,
        time: dt,
        expenseTimestamp: localTimestampFromInputs(dd, dt),
        paymentMethod: exp.paymentMethod || "cash",
        receipt: null,
        notes: exp.notes || "",
        reference: "",
        recurring: "none",
        expenseBy: exp.expenseBy || "",
        expenseBySupplierId: exp.expenseBySupplierId || "",
        bankAccountId: exp.bankAccountId || "",
        expenseItems: Array.isArray(exp.expenseItems)
          ? exp.expenseItems
          : [],
        expenseItemsCount: Array.isArray(exp.expenseItems)
          ? exp.expenseItems.length
          : 0,
        amountSource:
          Array.isArray(exp.expenseItems) && exp.expenseItems.length
            ? "items"
            : "manual",
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "expenses"), data);
      await syncExpenseToCash(data, ref.id, "add");
      showToast(`✅ ${t.duplicated}`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await deleteDoc(doc(db, "expenses", id));
      await syncExpenseToCash(null, id, "delete");
      if (expandedId === id) setExpandedId(null);
      showToast(`✅ ${t.deleted}`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
  };

  // ═══════ FILTERS ═══════
  const filtered = useMemo(() => {
    let res = expenses.filter((exp) => {
      const ed = getExpenseEventDate(exp);
      const em = getExpenseEventMs(exp);
      if (dateFilter === "custom") {
        if (customFrom && ed < customFrom) return false;
        if (customTo && ed > customTo) return false;
      } else if (dateFilter !== "allTime") {
        if (
          em < rangeStart(dateFilter) ||
          em > rangeEnd(dateFilter)
        )
          return false;
      }
      if (
        categoryFilter !== "all" &&
        exp.category !== categoryFilter
      )
        return false;
      if (
        paymentFilter !== "all" &&
        exp.paymentMethod !== paymentFilter
      )
        return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const ih = (exp.expenseItems || [])
          .map((i) => `${i.itemName || ""} ${i.unit || ""}`)
          .join(" ")
          .toLowerCase();
        const hay = [
          exp.description,
          exp.category,
          exp.notes,
          exp.reference,
          exp.expenseBy,
          String(exp.amount || ""),
          getBankAccountLabel(exp.bankAccountId),
          ih,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });

    switch (sortBy) {
      case "oldest":
        res.sort(
          (a, b) =>
            getExpenseEventMs(a) - getExpenseEventMs(b)
        );
        break;
      case "highest":
        res.sort(
          (a, b) => toNum(b.amount) - toNum(a.amount)
        );
        break;
      case "lowest":
        res.sort(
          (a, b) => toNum(a.amount) - toNum(b.amount)
        );
        break;
      default:
        res.sort(
          (a, b) =>
            getExpenseEventMs(b) - getExpenseEventMs(a)
        );
    }
    return res;
  }, [
    expenses,
    dateFilter,
    categoryFilter,
    paymentFilter,
    searchTerm,
    sortBy,
    customFrom,
    customTo,
    getBankAccountLabel,
  ]);

  // ═══════ STATS ═══════
  const stats = useMemo(() => {
    const total = filtered.reduce(
      (s, e) => s + toNum(e.amount),
      0
    );
    const count = filtered.length;
    const avg = count > 0 ? total / count : 0;
    const highest =
      count > 0
        ? Math.max(...filtered.map((e) => toNum(e.amount)))
        : 0;
    const lowest =
      count > 0
        ? Math.min(...filtered.map((e) => toNum(e.amount)))
        : 0;
    const catMap = {};
    filtered.forEach((e) => {
      const c = e.category || t.noCategory;
      if (!catMap[c]) catMap[c] = { total: 0, count: 0 };
      catMap[c].total += toNum(e.amount);
      catMap[c].count++;
    });
    const catBreak = Object.entries(catMap).sort(
      (a, b) => b[1].total - a[1].total
    );
    const payMap = {};
    filtered.forEach((e) => {
      const p = e.paymentMethod || "cash";
      if (!payMap[p]) payMap[p] = { total: 0, count: 0 };
      payMap[p].total += toNum(e.amount);
      payMap[p].count++;
    });
    const payBreak = Object.entries(payMap).sort(
      (a, b) => b[1].total - a[1].total
    );
    const bankMap = {};
    filtered.forEach((e) => {
      if (e.bankAccountId) {
        const l =
          getBankAccountLabel(e.bankAccountId) || "Unknown";
        if (!bankMap[l]) bankMap[l] = { total: 0, count: 0 };
        bankMap[l].total += toNum(e.amount);
        bankMap[l].count++;
      }
    });
    const bankBreak = Object.entries(bankMap).sort(
      (a, b) => b[1].total - a[1].total
    );
    const dayMap = {};
    filtered.forEach((e) => {
      const d = getExpenseEventDate(e);
      if (!dayMap[d]) dayMap[d] = 0;
      dayMap[d] += toNum(e.amount);
    });
    const days = Object.keys(dayMap).length;
    const dailyAvg = days > 0 ? total / days : 0;
    return {
      total,
      count,
      avg,
      highest,
      lowest,
      catBreak,
      payBreak,
      bankBreak,
      dailyAvg,
      days,
    };
  }, [filtered, t.noCategory, getBankAccountLabel]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page]
  );

  useEffect(() => {
    setPage(1);
  }, [
    dateFilter,
    categoryFilter,
    paymentFilter,
    searchTerm,
    sortBy,
    customFrom,
    customTo,
  ]);

  const usedCats = useMemo(
    () => [
      ...new Set(
        expenses.map((e) => e.category).filter(Boolean)
      ),
    ],
    [expenses]
  );

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setPaymentFilter("all");
    setDateFilter("thisMonth");
    setSortBy("newest");
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
  };

  const exportCSV = () => {
    const hdr = [
      "Date","Time","Category","Amount","Description",
      "Payment","Bank","Reference","ExpenseBy","Items","Notes",
    ];
    const rows = filtered.map((e) => [
      getExpenseEventDate(e),
      getExpenseEventTime(e),
      e.category || "",
      e.amount || 0,
      (e.description || "").replace(/,/g, ";"),
      e.paymentMethod || "",
      getBankAccountLabel(e.bankAccountId) || "",
      e.reference || "",
      e.expenseBy || "",
      summarizeExpenseItems(e.expenseItems || [], 10).replace(
        /,/g,
        ";"
      ),
      (e.notes || "").replace(/,/g, ";"),
    ]);
    const csv = [hdr, ...rows]
      .map((r) => r.join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${todayISO()}.csv`;
    a.click();
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${t.title}</title><style>body{font-family:Arial;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px}th{background:#f0f0f0}h1{font-size:18px}.total{font-size:16px;font-weight:bold;margin:10px 0}</style></head><body><h1>💰 ${t.title}</h1><div class="total">${t.totalExpenses}: Rs.${fmtC(stats.total)} (${stats.count} ${t.entries})</div>${el.innerHTML}</body></html>`
    );
    w.document.close();
    w.onafterprint = () => w.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 500);
  };

  // ═══════ RENDER ═══════
  if (loading)
    return (
      <div style={S.loadingWrap}>
        <div style={S.spinner} />
        <p style={{ color: "#64748b", marginTop: 12 }}>{t.loading}</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );

  return (
    <div style={S.wrap}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media print{.noPrint{display:none!important}}`}</style>
      {toast && <div style={S.toast}>{toast}</div>}

      {/* HEADER */}
      <div style={S.header} className="noPrint">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 30 }}>💰</span>
          <div>
            <h1 style={S.h1}>{t.title}</h1>
            <p style={S.sub}>
              {t.totalExpenses}: Rs.{fmtC(stats.total)} ({stats.count})
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={S.tabGrp}>
            {[
              ["list", "📄", t.list],
              ["analytics", "📊", t.analytics],
            ].map(([k, ico, lb]) => (
              <button
                key={k}
                onClick={() => setMainTab(k)}
                style={{
                  ...S.tabBtn,
                  ...(mainTab === k ? S.tabBtnOn : {}),
                }}
              >
                {ico} {lb}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCategoryModal(true)}
            style={S.icoBtn}
          >
            ⚙️
          </button>
          <button
            onClick={() => {
              setFormData(createInitialFormData());
              setEditingId(null);
              setShowForm(true);
            }}
            style={S.addBtn}
          >
            ➕ {t.addExpense}
          </button>
        </div>
      </div>

      {/* Sync + Fix */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          marginBottom: 12,
          borderRadius: 8,
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          fontSize: 12,
          color: "#0369a1",
          flexWrap: "wrap",
        }}
        className="noPrint"
      >
        <span style={{ flex: 1 }}>🔗 {t.syncInfo}</span>
        <button
          onClick={handleFixOldTimes}
          disabled={fixing}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid #f59e0b",
            background: fixing ? "#fef3c7" : "#fffbeb",
            color: "#92400e",
            fontSize: 11,
            fontWeight: 700,
            cursor: fixing ? "wait" : "pointer",
            opacity: fixing ? 0.6 : 1,
          }}
        >
          {fixing ? `⏳ ${t.fixingTimes}` : t.fixOldTimes}
        </button>
      </div>

      {/* Cash Link */}
      {/* ── Next.js: router.push replaces navigate() ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          marginBottom: 14,
          borderRadius: 10,
          background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
          border: "1px solid #d8b4fe",
          cursor: "pointer",
        }}
        className="noPrint"
        onClick={() => router.push("/cash-management")}
      >
        <span style={{ fontSize: 22 }}>💵</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: "#5b21b6",
            }}
          >
            {t.viewCashManagement}
          </div>
          <div style={{ fontSize: 11, color: "#7c3aed" }}>
            {t.cashManagementInfo}
          </div>
        </div>
        <span style={{ fontSize: 18, color: "#7c3aed" }}>→</span>
      </div>

      {/* Stats */}
      <div style={S.statsGrid} className="noPrint">
        <div
          style={{
            ...S.statCard,
            background:
              "linear-gradient(135deg,#dc2626,#ef4444)",
            color: "white",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            💸 {t.totalExpenses}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              marginTop: 4,
            }}
          >
            Rs.{fmtC(stats.total)}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              marginTop: 2,
            }}
          >
            {stats.count} {t.entries}
          </div>
        </div>
        <div
          style={{
            ...S.statCard,
            background:
              "linear-gradient(135deg,#7c3aed,#a855f7)",
            color: "white",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            📊 {t.avgExpense}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              marginTop: 4,
            }}
          >
            Rs.{fmtC(stats.avg)}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              marginTop: 2,
            }}
          >
            {t.dailyAvg}: Rs.{fmtC(stats.dailyAvg)}
          </div>
        </div>
        <div
          style={{
            ...S.statCard,
            background:
              "linear-gradient(135deg,#059669,#10b981)",
            color: "white",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            🔝 {t.highestExpense}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              marginTop: 4,
            }}
          >
            Rs.{fmtC(stats.highest)}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              marginTop: 2,
            }}
          >
            {t.lowestExpense}: Rs.{fmtC(stats.lowest)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={S.filterSection} className="noPrint">
        <div style={S.pillRow}>
          {[
            "today",
            "yesterday",
            "thisWeek",
            "thisMonth",
            "lastMonth",
            "last3Months",
            "thisYear",
            "allTime",
          ].map((f) => (
            <button
              key={f}
              onClick={() => {
                setDateFilter(f);
                setPage(1);
              }}
              style={{
                ...S.pill,
                ...(dateFilter === f ? S.pillOn : {}),
              }}
            >
              {t[f]}
            </button>
          ))}
          <button
            onClick={() => setDateFilter("custom")}
            style={{
              ...S.pill,
              fontSize: 11,
              padding: "4px 10px",
            }}
          >
            📅 {t.customRange}
          </button>
        </div>

        {dateFilter === "custom" && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={S.dateLbl}>{t.from}:</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={S.dateInp}
            />
            <label style={S.dateLbl}>{t.to}:</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={S.dateInp}
            />
          </div>
        )}

        <div style={S.filterBar}>
          <div style={S.srchWrap}>
            <span style={S.srchIco}>🔍</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.search}
              style={S.srchInp}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                style={S.srchClear}
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={S.sel}
          >
            <option value="all">
              📁 {t.all} {t.category}
            </option>
            {usedCats.map((c) => {
              const info = getCatInfo(c);
              return (
                <option key={c} value={c}>
                  {info.icon} {c.split("/")[0].trim()}
                </option>
              );
            })}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={S.sel}
          >
            <option value="all">💳 {t.all}</option>
            {paymentMethods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.icon} {p.en}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={S.sel}
          >
            <option value="newest">⬇️ {t.sortNewest}</option>
            <option value="oldest">⬆️ {t.sortOldest}</option>
            <option value="highest">💰 {t.sortHighest}</option>
            <option value="lowest">💲 {t.sortLowest}</option>
          </select>
          <button onClick={clearFilters} style={S.clrBtn}>
            🔄
          </button>
        </div>

        <div style={S.actRow}>
          <span style={S.resCnt}>
            📋 {filtered.length} {t.entries} • Rs.
            {fmtC(stats.total)}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={exportCSV} style={S.expBtn}>
              📥 {t.exportCSV}
            </button>
            <button onClick={handlePrint} style={S.prtBtn}>
              🖨️ {t.print}
            </button>
          </div>
        </div>
      </div>

      {/* Analytics Tab */}
      {mainTab === "analytics" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {stats.catBreak.length > 0 && (
            <div style={S.card}>
              <h3 style={S.cardH}>
                📊 {t.categoryBreakdown}
              </h3>
              {stats.catBreak.map(([cat, data]) => {
                const info = getCatInfo(cat);
                const pct =
                  stats.total > 0
                    ? (data.total / stats.total) * 100
                    : 0;
                return (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {info.icon}{" "}
                        {cat.split("/")[0].trim()}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: info.color,
                        }}
                      >
                        Rs.{fmtC(data.total)}{" "}
                        <span
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                          }}
                        >
                          ({data.count})
                        </span>
                      </span>
                    </div>
                    <div style={S.barBgLg}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: info.color,
                          borderRadius: 6,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {stats.payBreak.length > 0 && (
            <div style={S.card}>
              <h3 style={S.cardH}>
                💳 {t.paymentBreakdown}
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill,minmax(160px,1fr))",
                  gap: 10,
                }}
              >
                {stats.payBreak.map(([pay, data]) => {
                  const pm =
                    paymentMethods.find(
                      (p) => p.value === pay
                    ) || { icon: "💵", en: pay };
                  return (
                    <div
                      key={pay}
                      style={{
                        padding: 14,
                        background: "#f8fafc",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 24 }}>
                        {pm.icon}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        {pm.en}
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          marginTop: 4,
                        }}
                      >
                        Rs.{fmtC(data.total)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                        }}
                      >
                        {data.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.bankBreak.length > 0 && (
            <div style={S.card}>
              <h3 style={S.cardH}>
                🏦{" "}
                {lang === "si"
                  ? "බැංකු ගිණුම් අනුව"
                  : "By Bank Account"}
              </h3>
              {stats.bankBreak.map(([bank, data]) => {
                const pct =
                  stats.total > 0
                    ? (data.total / stats.total) * 100
                    : 0;
                return (
                  <div
                    key={bank}
                    style={{ marginBottom: 10 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        🏦 {bank}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#2563eb",
                        }}
                      >
                        Rs.{fmtC(data.total)}
                      </span>
                    </div>
                    <div style={S.barBgLg}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: "#2563eb",
                          borderRadius: 6,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* List Tab */}
      {mainTab === "list" && (
        <div ref={printRef}>
          {!filtered.length ? (
            <div style={S.empty}>
              <span style={{ fontSize: 56 }}>📭</span>
              <p style={{ color: "#94a3b8", marginTop: 12 }}>
                {t.noExpenses}
              </p>
              <button onClick={clearFilters} style={S.clrBtn2}>
                {t.clearFilters}
              </button>
            </div>
          ) : (
            <>
              {paged.map((exp) => {
                const info = getCatInfo(exp.category);
                const isExpanded = expandedId === exp.id;
                const pmInfo = paymentMethods.find(
                  (m) => m.value === exp.paymentMethod
                );
                const itemCount = Array.isArray(exp.expenseItems)
                  ? exp.expenseItems.length
                  : 0;
                const firstItemImg =
                  itemCount > 0
                    ? exp.expenseItems[0].itemImage ||
                      getItemImageUrl(
                        inventoryItems.find(
                          (i) =>
                            i.id === exp.expenseItems[0].itemId
                        )
                      ) ||
                      null
                    : null;

                return (
                  <div
                    key={exp.id}
                    style={{
                      ...S.expCard,
                      borderLeftColor: info.color,
                    }}
                  >
                    <div
                      style={S.expTop}
                      onClick={() =>
                        setExpandedId(
                          isExpanded ? null : exp.id
                        )
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flex: 1,
                        }}
                      >
                        {firstItemImg ? (
                          <img
                            src={firstItemImg}
                            alt=""
                            style={S.expItemThumb}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = PLACEHOLDER_IMG;
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              ...S.catIcon,
                              background: `${info.color}18`,
                              color: info.color,
                            }}
                          >
                            {info.icon}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 15,
                              color: "#0f172a",
                            }}
                          >
                            {exp.category
                              ?.split("/")[0]
                              ?.trim() || t.noCategory}
                          </div>
                          {exp.description && (
                            <div
                              style={{
                                fontSize: 13,
                                color: "#64748b",
                                marginTop: 1,
                              }}
                            >
                              {exp.description}
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              marginTop: 4,
                              alignItems: "center",
                            }}
                          >
                            <span style={S.tag}>
                              📅 {getExpenseEventDate(exp)}
                            </span>
                            <span style={S.tagMuted}>
                              🕒 {getExpenseEventTime(exp)}
                            </span>
                            <span
                              style={{
                                ...S.tag,
                                background: "#f1f5f9",
                              }}
                            >
                              {pmInfo?.icon || "💰"}{" "}
                              {pmInfo?.en || "Cash"}
                            </span>
                            {exp.bankAccountId && (
                              <span
                                style={{
                                  ...S.tag,
                                  background: "#eff6ff",
                                  color: "#1e40af",
                                  border:
                                    "1px solid #bfdbfe",
                                }}
                              >
                                🏦{" "}
                                {getBankAccountLabel(
                                  exp.bankAccountId
                                )}
                              </span>
                            )}
                            {exp.expenseBy && (
                              <span
                                style={{
                                  ...S.tag,
                                  background: "#ecfeff",
                                  color: "#155e75",
                                  border:
                                    "1px solid #a5f3fc",
                                }}
                              >
                                👤 {exp.expenseBy}
                              </span>
                            )}
                            {itemCount > 0 && (
                              <span
                                style={{
                                  ...S.tag,
                                  background: "#f5f3ff",
                                  color: "#6d28d9",
                                  border:
                                    "1px solid #ddd6fe",
                                }}
                              >
                                📦 {itemCount}
                              </span>
                            )}
                            {exp.receipt && (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#16a34a",
                                }}
                              >
                                📷
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontWeight: 900,
                            fontSize: 20,
                            color: "#dc2626",
                          }}
                        >
                          Rs.{fmtC(exp.amount)}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                          }}
                        >
                          {isExpanded ? "🔼" : "🔽"}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={S.expDetail}>
                        {exp.notes && (
                          <div style={S.detailRow}>
                            <span style={S.detailLabel}>
                              📝 {t.notes}:
                            </span>
                            <span>{exp.notes}</span>
                          </div>
                        )}
                        {exp.reference && (
                          <div style={S.detailRow}>
                            <span style={S.detailLabel}>
                              🔖 {t.reference}:
                            </span>
                            <span>{exp.reference}</span>
                          </div>
                        )}
                        {exp.expenseBy && (
                          <div style={S.detailRow}>
                            <span style={S.detailLabel}>
                              👤 {t.expenseBy}:
                            </span>
                            <span>{exp.expenseBy}</span>
                          </div>
                        )}
                        {exp.bankAccountId && (
                          <div style={S.detailRow}>
                            <span style={S.detailLabel}>
                              🏦 {t.bankAccount}:
                            </span>
                            <span>
                              {getBankAccountLabel(
                                exp.bankAccountId
                              )}
                            </span>
                          </div>
                        )}

                        {itemCount > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div
                              style={{
                                ...S.detailLabel,
                                marginBottom: 8,
                              }}
                            >
                              📦 {t.expenseItems}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {exp.expenseItems.map(
                                (row, idx) => {
                                  const rowImg =
                                    row.itemImage ||
                                    getItemImageUrl(
                                      inventoryItems.find(
                                        (i) =>
                                          i.id === row.itemId
                                      )
                                    ) ||
                                    null;
                                  return (
                                    <div
                                      key={idx}
                                      style={
                                        S.expandedItemRow
                                      }
                                    >
                                      <img
                                        src={
                                          rowImg ||
                                          PLACEHOLDER_IMG
                                        }
                                        alt=""
                                        style={
                                          S.expandedItemImg
                                        }
                                        onError={(e) => {
                                          e.target.onerror =
                                            null;
                                          e.target.src =
                                            PLACEHOLDER_IMG;
                                        }}
                                      />
                                      <div
                                        style={{
                                          flex: 1,
                                          minWidth: 0,
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: 600,
                                            fontSize: 13,
                                            color: "#0f172a",
                                          }}
                                        >
                                          {row.itemName}
                                          {row.unit ? (
                                            <small
                                              style={{
                                                color:
                                                  "#64748b",
                                                marginLeft: 6,
                                              }}
                                            >
                                              ({row.unit})
                                            </small>
                                          ) : null}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 12,
                                            color: "#64748b",
                                          }}
                                        >
                                          {toNum(
                                            row.qty || 1
                                          )}{" "}
                                          × Rs.
                                          {fmtC(row.unitPrice)}
                                        </div>
                                      </div>
                                      <div
                                        style={{
                                          fontWeight: 800,
                                          fontSize: 14,
                                          color: "#0f172a",
                                        }}
                                      >
                                        Rs.
                                        {fmtC(
                                          row.lineTotal ||
                                            toNum(
                                              row.qty || 1
                                            ) *
                                              toNum(
                                                row.unitPrice
                                              )
                                        )}
                                      </div>
                                    </div>
                                  );
                                }
                              )}
                              <div style={S.itemsTotalBar}>
                                <span>
                                  📦 {t.itemsTotal}
                                </span>
                                <span>
                                  Rs.
                                  {fmtC(
                                    exp.expenseItems.reduce(
                                      (s, r) =>
                                        s +
                                        toNum(
                                          r.lineTotal ||
                                            toNum(
                                              r.qty || 1
                                            ) *
                                              toNum(
                                                r.unitPrice
                                              )
                                        ),
                                      0
                                    )
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          {exp.receipt && (
                            <button
                              onClick={() =>
                                setViewReceipt(exp.receipt)
                              }
                              style={S.actBtnBlue}
                            >
                              📷 {t.viewReceipt}
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(exp)}
                            style={S.actBtnBlue}
                          >
                            ✏️{" "}
                            {lang === "si"
                              ? "සංස්කරණය"
                              : "Edit"}
                          </button>
                          <button
                            onClick={() =>
                              handleDuplicate(exp)
                            }
                            style={S.actBtnGreen}
                          >
                            📋 {t.duplicateExpense}
                          </button>
                          <button
                            onClick={() =>
                              handleDelete(exp.id)
                            }
                            style={S.actBtnRed}
                          >
                            🗑️ {t.delete}
                          </button>
                        </div>
                      </div>
                    )}

                    {!isExpanded && (
                      <div
                        style={S.expQuickAct}
                        className="noPrint"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(exp);
                          }}
                          style={S.qBtn}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(exp);
                          }}
                          style={S.qBtn}
                        >
                          📋
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(exp.id);
                          }}
                          style={{
                            ...S.qBtn,
                            borderColor: "#fca5a5",
                            background: "#fef2f2",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div
                  style={S.pgBar}
                  className="noPrint"
                >
                  <button
                    onClick={() =>
                      setPage((p) => Math.max(1, p - 1))
                    }
                    disabled={page === 1}
                    style={{
                      ...S.pgBtn,
                      opacity: page === 1 ? 0.4 : 1,
                    }}
                  >
                    ◀{" "}
                    {lang === "en" ? "Prev" : "පෙර"}
                  </button>
                  <span
                    style={{
                      fontSize: 13,
                      color: "#475569",
                      fontWeight: 600,
                    }}
                  >
                    {page}/{totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setPage((p) =>
                        Math.min(totalPages, p + 1)
                      )
                    }
                    disabled={page === totalPages}
                    style={{
                      ...S.pgBtn,
                      opacity:
                        page === totalPages ? 0.4 : 1,
                    }}
                  >
                    {lang === "en" ? "Next" : "ඊළඟ"} ▶
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════ FORM MODAL ═══════ */}
      {showForm && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalHead}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {editingId
                  ? `✏️ ${t.editExpense}`
                  : `➕ ${t.addExpense}`}
              </h3>
              <button onClick={resetForm} style={S.closeBtn}>
                ✕
              </button>
            </div>
            <div style={S.modalBody}>
              {/* Category */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.formLabel}>
                  📁 {t.category} *
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill,minmax(100px,1fr))",
                    gap: 6,
                  }}
                >
                  {categories.map((cat, idx) => (
                    <button
                      key={idx}
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          category: cat.name,
                        }))
                      }
                      style={{
                        padding: "10px 6px",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 11,
                        textAlign: "center",
                        border:
                          formData.category === cat.name
                            ? `2px solid ${cat.color}`
                            : "1px solid #e2e8f0",
                        background:
                          formData.category === cat.name
                            ? `${cat.color}12`
                            : "white",
                        color:
                          formData.category === cat.name
                            ? cat.color
                            : "#475569",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 22,
                          marginBottom: 2,
                        }}
                      >
                        {cat.icon}
                      </div>
                      <div
                        style={{
                          lineHeight: 1.2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat.name.split("/")[0].trim()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.formLabel}>
                  💰 {t.amount} *
                </label>
                <input
                  type="number"
                  value={
                    hasItemizedExpense
                      ? (Number(expenseItemsTotal) || 0).toFixed(2)
                      : formData.amount
                  }
                  onChange={(e) =>
                    !hasItemizedExpense &&
                    setFormData((p) => ({
                      ...p,
                      amount: e.target.value,
                    }))
                  }
                  style={{
                    ...S.amountInp,
                    opacity: hasItemizedExpense ? 0.85 : 1,
                    background: hasItemizedExpense
                      ? "#fef7ed"
                      : "#fef2f2",
                    borderColor: hasItemizedExpense
                      ? "#f59e0b"
                      : "#ef4444",
                  }}
                  placeholder="0.00"
                  readOnly={hasItemizedExpense}
                />
                <div style={S.helperLine}>
                  {hasItemizedExpense
                    ? `ℹ️ ${t.amountFromItems}`
                    : `✍️ ${t.manualAmount}`}
                </div>
              </div>

              {/* Date Time */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label style={S.formLabel}>
                    📅 {t.date}
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        date: e.target.value,
                      }))
                    }
                    style={S.inp}
                  />
                </div>
                <div>
                  <label style={S.formLabel}>
                    🕒 {t.time}
                  </label>
                  <input
                    type="time"
                    value={formData.time || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        time: e.target.value,
                      }))
                    }
                    style={S.inp}
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.formLabel}>
                  📝 {t.description}
                </label>
                <input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                  style={S.inp}
                />
              </div>

              {/* Payment */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.formLabel}>
                  💳 {t.paymentMethod}
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {paymentMethods.map((pm) => (
                    <button
                      key={pm.value}
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          paymentMethod: pm.value,
                          bankAccountId: pm.needsBank
                            ? p.bankAccountId
                            : "",
                        }))
                      }
                      style={{
                        flex: 1,
                        padding: "10px 6px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 12,
                        minWidth: 70,
                        border:
                          formData.paymentMethod === pm.value
                            ? "2px solid #3b82f6"
                            : "1px solid #e2e8f0",
                        background:
                          formData.paymentMethod === pm.value
                            ? "#eff6ff"
                            : "white",
                        color:
                          formData.paymentMethod === pm.value
                            ? "#3b82f6"
                            : "#64748b",
                      }}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bank */}
              {needsBankAccount && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 16,
                    borderRadius: 12,
                    background:
                      "linear-gradient(135deg,#eff6ff,#dbeafe)",
                    border: "2px solid #93c5fd",
                  }}
                >
                  <label
                    style={{
                      ...S.formLabel,
                      color: "#1e40af",
                    }}
                  >
                    🏦 {t.selectBank} *
                  </label>
                  {!activeBankAccounts.length ? (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        background: "#fef3c7",
                        border: "1px solid #fcd34d",
                        color: "#92400e",
                        fontSize: 13,
                      }}
                    >
                      ⚠️ {t.noBankAccounts}
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill,minmax(200px,1fr))",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        {activeBankAccounts.map((acc) => {
                          const isSel =
                            formData.bankAccountId === acc.id;
                          return (
                            <button
                              key={acc.id}
                              onClick={() =>
                                setFormData((p) => ({
                                  ...p,
                                  bankAccountId: acc.id,
                                }))
                              }
                              style={{
                                padding: "12px 14px",
                                borderRadius: 12,
                                cursor: "pointer",
                                textAlign: "left",
                                border: isSel
                                  ? "2px solid #2563eb"
                                  : "1px solid #cbd5e1",
                                background: isSel
                                  ? "linear-gradient(135deg,#2563eb,#3b82f6)"
                                  : "white",
                                color: isSel
                                  ? "white"
                                  : "#1e293b",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  fontSize: 13,
                                  marginBottom: 4,
                                }}
                              >
                                🏦{" "}
                                {(
                                  acc.bankName || ""
                                )
                                  .split("(")[0]
                                  .trim()}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: isSel
                                    ? 0.9
                                    : 0.7,
                                  marginBottom: 6,
                                }}
                              >
                                {acc.accountName || "-"}
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 900,
                                }}
                              >
                                Rs.
                                {fmtC(
                                  toNum(acc.currentBalance)
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {formData.bankAccountId &&
                        selectedBankAccount &&
                        (hasItemizedExpense
                          ? expenseItemsTotal
                          : toNum(formData.amount)) > 0 && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: "10px 14px",
                              borderRadius: 10,
                              background: "white",
                              border: "1px solid #bfdbfe",
                              display: "flex",
                              justifyContent:
                                "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                              }}
                            >
                              💰 Balance after:
                            </div>
                            <div
                              style={{
                                fontSize: 18,
                                fontWeight: 900,
                                color:
                                  toNum(
                                    selectedBankAccount.currentBalance
                                  ) -
                                    (hasItemizedExpense
                                      ? expenseItemsTotal
                                      : toNum(
                                          formData.amount
                                        )) >=
                                  0
                                    ? "#10b981"
                                    : "#ef4444",
                              }}
                            >
                              Rs.
                              {fmtC(
                                toNum(
                                  selectedBankAccount.currentBalance
                                ) -
                                  (hasItemizedExpense
                                    ? expenseItemsTotal
                                    : toNum(formData.amount))
                              )}
                            </div>
                          </div>
                        )}
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: "#3b82f6",
                        }}
                      >
                        ℹ️ {t.bankAutoDeduct}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Reference + Supplier */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label style={S.formLabelSm}>
                    🔖 {t.reference}
                  </label>
                  <input
                    value={formData.reference}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        reference: e.target.value,
                      }))
                    }
                    style={S.inpSm}
                  />
                </div>
                <div>
                  <label style={S.formLabelSm}>
                    👤 {t.expenseBy}
                  </label>
                  <button
                    type="button"
                    onClick={openSupplierPicker}
                    style={S.selectorBtn}
                  >
                    <span
                      style={{
                        color: formData.expenseBy
                          ? "#0f172a"
                          : "#94a3b8",
                        fontWeight: formData.expenseBy
                          ? 700
                          : 500,
                      }}
                    >
                      {formData.expenseBy ||
                        t.clickExpenseBy}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      ▼
                    </span>
                  </button>
                  {formData.expenseBy && (
                    <div style={S.selectedChipRow}>
                      <span style={S.selectedChip}>
                        👤 {formData.expenseBy}
                      </span>
                      <button
                        onClick={handleClearSupplier}
                        style={S.miniGhostBtn}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.formLabelSm}>
                  📋 {t.notes}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      notes: e.target.value,
                    }))
                  }
                  rows={2}
                  style={{
                    ...S.inpSm,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* ═══ EXPENSE ITEMS ═══ */}
              <div style={S.itemsSection}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <label style={S.formLabel}>
                    📦 {t.expenseItems}
                  </label>
                  <button
                    onClick={addExpenseItemRow}
                    style={S.smallAddBtn}
                  >
                    ➕ {t.addItem}
                  </button>
                </div>
                <div style={S.helperLine}>
                  {t.expenseItemsDesc}
                </div>

                {!formData.expenseItems.length ? (
                  <div style={S.emptyItemsBox}>
                    <div style={{ fontSize: 28 }}>📦</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {t.expenseItemsDesc}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {formData.expenseItems.map((row, idx) => {
                      const rowImg = row.itemImage || null;
                      return (
                        <div
                          key={idx}
                          style={S.itemLineCard}
                        >
                          {rowImg && (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "center",
                                marginBottom: 8,
                              }}
                            >
                              <img
                                src={rowImg}
                                alt=""
                                style={
                                  S.formItemPreviewImg
                                }
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display =
                                    "none";
                                }}
                              />
                            </div>
                          )}
                          <div
                            style={{
                              marginBottom: 8,
                              display: "flex",
                              gap: 8,
                              alignItems: "flex-start",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <ItemSearchDropdown
                                inventoryItems={
                                  inventoryItems
                                }
                                value={row.itemId || ""}
                                currentName={
                                  row.itemName || ""
                                }
                                onSelect={(item) =>
                                  handleSelectInventoryItem(
                                    idx,
                                    item
                                  )
                                }
                                onNameChange={(v) =>
                                  updateExpenseItemRow(
                                    idx,
                                    { itemName: v }
                                  )
                                }
                                t={t}
                              />
                            </div>
                            <button
                              onClick={() =>
                                removeExpenseItemRow(idx)
                              }
                              style={S.removeLineBtn}
                            >
                              ✕
                            </button>
                          </div>

                          <div style={S.itemRowGrid}>
                            <div>
                              <label style={S.formLabelSm}>
                                {t.qty}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.qty || ""}
                                onChange={(e) =>
                                  updateExpenseItemRow(
                                    idx,
                                    { qty: e.target.value }
                                  )
                                }
                                style={S.inpSm}
                              />
                            </div>
                            <div>
                              <label style={S.formLabelSm}>
                                {t.unitPrice}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.unitPrice || ""}
                                onChange={(e) =>
                                  updateExpenseItemRow(
                                    idx,
                                    {
                                      unitPrice:
                                        e.target.value,
                                    }
                                  )
                                }
                                style={S.inpSm}
                              />
                            </div>
                            <div>
                              <label style={S.formLabelSm}>
                                {t.lineTotal}
                              </label>
                              <div style={S.lineTotalBox}>
                                Rs.
                                {fmtC(
                                  toNum(row.qty || 1) *
                                    toNum(row.unitPrice)
                                )}
                              </div>
                            </div>
                          </div>
                          {row.unit && (
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                color: "#64748b",
                              }}
                            >
                              📏 {row.unit}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={S.itemsTotalBar}>
                  <span>📦 {t.itemsTotal}</span>
                  <span>Rs.{fmtC(expenseItemsTotal)}</span>
                </div>
              </div>

              {/* Receipt */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.formLabel}>
                  📷 {t.receipt}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileRef}
                  onChange={handleReceipt}
                  style={{ display: "none" }}
                />
                {formData.receipt ? (
                  <div style={{ position: "relative" }}>
                    <img
                      src={formData.receipt}
                      alt="Receipt"
                      style={{
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "2px solid #16a34a",
                      }}
                    />
                    <button
                      onClick={() =>
                        setFormData((p) => ({
                          ...p,
                          receipt: null,
                        }))
                      }
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        background: "rgba(239,68,68,.9)",
                        color: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: 28,
                        height: 28,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                      width: "100%",
                      padding: 14,
                      border: "2px dashed #cbd5e1",
                      borderRadius: 10,
                      background: "#f8fafc",
                      color: "#64748b",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    📷 {t.attachReceipt}
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  marginBottom: 14,
                  borderRadius: 8,
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  fontSize: 12,
                  color: "#0369a1",
                }}
              >
                🔗 {t.syncInfo}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={resetForm}
                  style={S.cancelBtn}
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    ...S.saveBtn,
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving
                    ? `⏳ ${t.saving}`
                    : editingId
                    ? `✅ ${t.update}`
                    : `💾 ${t.save}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Picker Modal */}
      {showSupplierModal && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 520 }}>
            <div
              style={{
                ...S.modalHead,
                background:
                  "linear-gradient(135deg,#0f766e,#14b8a6)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17 }}>
                👤 {t.supplierPicker}
              </h3>
              <button
                onClick={() => setShowSupplierModal(false)}
                style={S.closeBtn}
              >
                ✕
              </button>
            </div>
            <div style={S.modalBody}>
              <input
                value={supplierSearch}
                onChange={(e) =>
                  setSupplierSearch(e.target.value)
                }
                placeholder={t.supplierSearch}
                style={{ ...S.inpSm, marginBottom: 12 }}
              />
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <button
                  onClick={() =>
                    setShowNewSupplierBox((p) => !p)
                  }
                  style={S.smallAddBtn}
                >
                  ➕ {t.createSupplier}
                </button>
              </div>

              {showNewSupplierBox && (
                <div style={S.newSupplierBox}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      value={newSupplier.name}
                      onChange={(e) =>
                        setNewSupplier((p) => ({
                          ...p,
                          name: e.target.value,
                        }))
                      }
                      placeholder={t.supplierName}
                      style={S.inpSm}
                    />
                    <input
                      value={newSupplier.companyName}
                      onChange={(e) =>
                        setNewSupplier((p) => ({
                          ...p,
                          companyName: e.target.value,
                        }))
                      }
                      placeholder={t.companyName}
                      style={S.inpSm}
                    />
                    <input
                      value={newSupplier.phone}
                      onChange={(e) =>
                        setNewSupplier((p) => ({
                          ...p,
                          phone: e.target.value,
                        }))
                      }
                      placeholder={t.phone}
                      style={S.inpSm}
                    />
                    <button
                      onClick={handleCreateSupplier}
                      disabled={creatingSupplier}
                      style={{
                        ...S.saveBtn,
                        flex: "unset",
                        opacity: creatingSupplier ? 0.7 : 1,
                      }}
                    >
                      {creatingSupplier
                        ? `⏳ ${t.saving}`
                        : `✅ ${t.saveSupplier}`}
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  maxHeight: "50vh",
                  overflowY: "auto",
                }}
              >
                {!supplierListFiltered.length ? (
                  <div style={S.emptyItemsBox}>
                    <div style={{ fontSize: 28 }}>👤</div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {supplierSearch
                        ? t.noMatchingSuppliers
                        : t.noSuppliers}
                    </div>
                  </div>
                ) : (
                  supplierListFiltered.map((sup) => {
                    const isS =
                      formData.expenseBySupplierId === sup.id;
                    return (
                      <button
                        key={sup.id}
                        onClick={() =>
                          handleSelectSupplier(sup)
                        }
                        style={{
                          ...S.supplierRowBtn,
                          borderColor: isS
                            ? "#14b8a6"
                            : "#e2e8f0",
                          background: isS
                            ? "#f0fdfa"
                            : "white",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 14,
                              color: "#0f172a",
                            }}
                          >
                            {sup.name}
                          </div>
                          {sup.companyName && (
                            <div
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                              }}
                            >
                              {sup.companyName}
                            </div>
                          )}
                          {sup.phone && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                              }}
                            >
                              {sup.phone}
                            </div>
                          )}
                        </div>
                        {isS && (
                          <div
                            style={{
                              color: "#0f766e",
                              fontWeight: 800,
                            }}
                          >
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt View */}
      {viewReceipt && (
        <div
          onClick={() => setViewReceipt(null)}
          style={S.receiptOverlay}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative" }}
          >
            <img
              src={viewReceipt}
              alt="Receipt"
              style={{
                maxWidth: "92vw",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: 12,
              }}
            />
            <button
              onClick={() => setViewReceipt(null)}
              style={S.receiptClose}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth: 420 }}>
            <div
              style={{
                ...S.modalHead,
                background: "#f8fafc",
                color: "#1e293b",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17 }}>
                ⚙️ {t.manageCategories}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                style={{
                  ...S.closeBtn,
                  color: "#64748b",
                  background: "#e2e8f0",
                }}
              >
                ✕
              </button>
            </div>
            <div style={S.modalBody}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <input
                  value={newCatName}
                  onChange={(e) =>
                    setNewCatName(e.target.value)
                  }
                  placeholder={t.categoryName}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleAddCategory()
                  }
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={handleAddCategory}
                  style={{
                    padding: "12px 16px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ➕
                </button>
              </div>
              <div
                style={{
                  maxHeight: "50vh",
                  overflowY: "auto",
                }}
              >
                {categories.map((cat, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 4px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 20 }}>
                        {cat.icon}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        {cat.name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: cat.color,
                        }}
                      />
                      {cat.isCustom && (
                        <button
                          onClick={() =>
                            handleDeleteCategory(cat.id)
                          }
                          style={{
                            background: "#fef2f2",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 12,
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpenseManager;

/* ═══════════════════════════════════════
   STYLES
   ═══════════════════════════════════════ */
const S = {
  wrap: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 8px 100px",
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    background: "#f8fafc",
    minHeight: "100vh",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "60vh",
  },
  spinner: {
    width: 44,
    height: 44,
    border: "4px solid #e2e8f0",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin .8s linear infinite",
  },
  toast: {
    position: "fixed",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1e293b",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: 10,
    zIndex: 9999,
    fontSize: 15,
    fontWeight: 600,
    boxShadow: "0 8px 24px rgba(0,0,0,.2)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 14,
    borderBottom: "1px solid #e2e8f0",
  },
  h1: { margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" },
  sub: { margin: "3px 0 0", fontSize: 12, color: "#64748b" },
  tabGrp: {
    display: "flex",
    background: "#f1f5f9",
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 8,
    background: "transparent",
    color: "#64748b",
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
  },
  tabBtnOn: {
    background: "white",
    color: "#1e293b",
    fontWeight: 600,
    boxShadow: "0 1px 3px rgba(0,0,0,.1)",
  },
  icoBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "white",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg,#dc2626,#ef4444)",
    color: "white",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    padding: 16,
    borderRadius: 14,
    boxShadow: "0 2px 8px rgba(0,0,0,.08)",
  },
  filterSection: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 10,
  },
  pillRow: { display: "flex", gap: 4, flexWrap: "wrap" },
  pill: {
    padding: "7px 14px",
    borderRadius: 20,
    border: "1px solid #e2e8f0",
    background: "white",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  pillOn: {
    borderColor: "#3b82f6",
    background: "#eff6ff",
    color: "#2563eb",
  },
  dateLbl: { fontSize: 11, color: "#64748b", fontWeight: 600 },
  dateInp: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 13,
    outline: "none",
    width: 130,
  },
  filterBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "10px 14px",
    background: "white",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
  },
  srchWrap: { position: "relative", flex: 2, minWidth: 160 },
  srchIco: {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 14,
    pointerEvents: "none",
  },
  srchInp: {
    width: "100%",
    padding: "9px 30px 9px 34px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: "#f8fafc",
  },
  srchClear: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    color: "#94a3b8",
  },
  sel: {
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 12,
    outline: "none",
    background: "#fff",
    cursor: "pointer",
    minWidth: 80,
  },
  clrBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 14,
    cursor: "pointer",
  },
  actRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  resCnt: { fontSize: 13, fontWeight: 600, color: "#475569" },
  expBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #16a34a",
    background: "#f0fdf4",
    color: "#166534",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  prtBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #6366f1",
    background: "#eef2ff",
    color: "#4338ca",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  card: {
    background: "white",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    border: "1px solid #e2e8f0",
  },
  cardH: {
    margin: "0 0 14px 0",
    fontSize: 16,
    fontWeight: 700,
    color: "#1e293b",
  },
  barBgLg: {
    height: 8,
    background: "#f1f5f9",
    borderRadius: 4,
    overflow: "hidden",
  },
  expCard: {
    background: "white",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    borderLeft: "5px solid #94a3b8",
    overflow: "hidden",
    marginBottom: 8,
  },
  expTop: {
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    cursor: "pointer",
  },
  catIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    flexShrink: 0,
  },
  expItemThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    objectFit: "cover",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  tag: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 6,
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 500,
  },
  tagMuted: { fontSize: 10, color: "#94a3b8" },
  expDetail: {
    padding: "12px 16px",
    background: "#f8fafc",
    borderTop: "1px solid #f1f5f9",
  },
  detailRow: {
    display: "flex",
    gap: 8,
    fontSize: 13,
    color: "#334155",
    marginBottom: 6,
    flexWrap: "wrap",
  },
  detailLabel: {
    fontWeight: 600,
    color: "#64748b",
    flexShrink: 0,
  },
  expandedItemRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: "white",
    border: "1px solid #e2e8f0",
  },
  expandedItemImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    objectFit: "cover",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  expQuickAct: {
    display: "flex",
    gap: 4,
    padding: "6px 16px 10px",
    justifyContent: "flex-end",
  },
  qBtn: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    background: "white",
    cursor: "pointer",
    fontSize: 12,
  },
  actBtnBlue: {
    padding: "6px 12px",
    fontSize: 12,
    background: "#eff6ff",
    color: "#1e40af",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },
  actBtnGreen: {
    padding: "6px 12px",
    fontSize: 12,
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },
  actBtnRed: {
    padding: "6px 12px",
    fontSize: 12,
    background: "#fef2f2",
    color: "#dc2626",
    border: "1px solid #fecaca",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },
  pgBar: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    background: "white",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    marginTop: 8,
  },
  pgBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "white",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    color: "#475569",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    background: "white",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
  },
  clrBtn2: {
    marginTop: 16,
    padding: "10px 20px",
    borderRadius: 8,
    border: "1px solid #3b82f6",
    background: "#eff6ff",
    color: "#2563eb",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    backdropFilter: "blur(4px)",
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    background: "white",
    borderRadius: 18,
    width: "100%",
    maxWidth: 720,
    maxHeight: "94vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,.2)",
  },
  modalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 22px",
    background: "linear-gradient(135deg,#dc2626,#ef4444)",
    color: "white",
  },
  modalBody: { padding: 22, overflowY: "auto", flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "rgba(255,255,255,.2)",
    border: "none",
    fontSize: 18,
    cursor: "pointer",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  formLabel: {
    display: "block",
    fontSize: 14,
    fontWeight: 700,
    color: "#334155",
    marginBottom: 6,
  },
  formLabelSm: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
    marginBottom: 3,
  },
  inp: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    fontSize: 15,
    boxSizing: "border-box",
    background: "white",
    outline: "none",
  },
  inpSm: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  },
  amountInp: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
    border: "2px solid #ef4444",
    fontSize: 28,
    fontWeight: 900,
    textAlign: "center",
    boxSizing: "border-box",
    color: "#dc2626",
    background: "#fef2f2",
    outline: "none",
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    background: "#f1f5f9",
    color: "#64748b",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
  saveBtn: {
    flex: 2,
    padding: 14,
    background: "linear-gradient(135deg,#dc2626,#ef4444)",
    color: "white",
    border: "none",
    borderRadius: 10,
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  },
  receiptOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.92)",
    zIndex: 10001,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  receiptClose: {
    position: "absolute",
    top: -14,
    right: -14,
    background: "#ef4444",
    color: "white",
    border: "3px solid white",
    borderRadius: "50%",
    width: 38,
    height: 38,
    fontSize: 18,
    cursor: "pointer",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  helperLine: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 6,
    marginBottom: 8,
    lineHeight: 1.4,
  },
  selectorBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    cursor: "pointer",
    fontSize: 14,
  },
  selectedChipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
  },
  selectedChip: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#ecfeff",
    color: "#155e75",
    border: "1px solid #a5f3fc",
    fontSize: 12,
    fontWeight: 700,
  },
  miniGhostBtn: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "white",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  itemsSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    background: "#fafafc",
    border: "1px solid #e2e8f0",
  },
  smallAddBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #22c55e",
    background: "#f0fdf4",
    color: "#166534",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  emptyItemsBox: {
    padding: 18,
    borderRadius: 12,
    border: "1px dashed #cbd5e1",
    background: "white",
    textAlign: "center",
  },
  itemLineCard: {
    padding: 12,
    borderRadius: 12,
    background: "white",
    border: "1px solid #e2e8f0",
  },
  removeLineBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#dc2626",
    cursor: "pointer",
    fontWeight: 700,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
  },
  itemRowGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  lineTotalBox: {
    padding: 10,
    borderRadius: 8,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    fontWeight: 800,
    color: "#0f172a",
    textAlign: "right",
    fontSize: 13,
  },
  itemsTotalBar: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#fff7ed",
    border: "1px solid #fdba74",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: 800,
    color: "#9a3412",
  },
  newSupplierBox: {
    padding: 14,
    borderRadius: 12,
    background: "#f0fdfa",
    border: "1px solid #99f6e4",
    marginBottom: 12,
  },
  supplierRowBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "white",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    marginBottom: 8,
  },
  formItemPreviewImg: {
    width: 80,
    height: 60,
    borderRadius: 10,
    objectFit: "cover",
    border: "2px solid #e2e8f0",
  },
  selectedItemCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderRadius: 10,
    border: "2px solid #22c55e",
    background: "#f0fdf4",
  },
  selectedItemLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  selectedItemImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    objectFit: "cover",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  clearItemBtn: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#dc2626",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownToggle: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 12,
  },
  itemDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 100,
    background: "white",
    border: "2px solid #3b82f6",
    borderRadius: 12,
    boxShadow: "0 12px 36px rgba(0,0,0,.15)",
    maxHeight: 340,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  itemDropdownSearch: {
    padding: 8,
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  itemDropdownInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  itemDropdownList: { overflowY: "auto", flex: 1, maxHeight: 280 },
  itemDropdownEmpty: {
    padding: 24,
    textAlign: "center",
    color: "#64748b",
    fontSize: 13,
  },
  itemDropdownRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "1px solid #f1f5f9",
    transition: "background .1s",
  },
  itemDropdownImg: {
    width: 40,
    height: 40,
    borderRadius: 8,
    objectFit: "cover",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  },
};
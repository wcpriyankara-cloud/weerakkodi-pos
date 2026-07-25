// src/components/CustomerOrders.jsx
// â˜… v3 â€” Mobile-first + Approval flow with custom dialog
//   - Custom ApproveDialog (bottom sheet)
//   - Custom DeleteConfirmDialog (replaces window.confirm)
//   - Approval metadata (approvedAt, approvedBy)
//   - Status pipeline with visual progress
//   - iOS safe areas + touch feedback

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  memo,
} from "react";
import { db } from "@/shared/firebase-config";
import { useUserAuth } from "@/context/UserContext";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STATUS CONFIG
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const STATUS_CONFIG = {
  pending: {
    en: "Pending", si: "à¶…à¶´à·šà¶šà·Šà·‚à·’à¶­",
    color: "#f59e0b", bg: "#fefce8", border: "#fde68a", icon: "â³",
    next: "confirmed",
    nextLabelSi: "Approve à¶šà¶»à¶±à·Šà¶±",
    nextIcon: "âœ…",
  },
  confirmed: {
    en: "Approved", si: "Approved",
    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "âœ…",
    next: "processing",
    nextLabelSi: "Processing à¶šà¶»à¶±à·Šà¶±",
    nextIcon: "ðŸ”„",
  },
  processing: {
    en: "Processing", si: "à·ƒà¶šà·ƒà·Š à·€à·™à¶¸à·’à¶±à·Š",
    color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "ðŸ”„",
    next: "shipped",
    nextLabelSi: "Ship à¶šà¶»à¶±à·Šà¶±",
    nextIcon: "ðŸšš",
  },
  shipped: {
    en: "Shipped", si: "à¶ºà·€à· à¶‡à¶­",
    color: "#7c3aed", bg: "#faf5ff", border: "#ddd6fe", icon: "ðŸšš",
    next: "delivered",
    nextLabelSi: "Delivered à¶šà¶»à¶±à·Šà¶±",
    nextIcon: "ðŸ“¦",
  },
  delivered: {
    en: "Delivered", si: "à¶½à·à¶¶à·”à¶«à·’",
    color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: "ðŸ“¦",
    next: null,
  },
  cancelled: {
    en: "Cancelled", si: "à¶…à·€à¶½à¶‚à¶œà·”",
    color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "âŒ",
    next: null,
  },
};

const STATUS_PIPELINE = ["pending", "confirmed", "processing", "shipped", "delivered"];

const getStatusConfig = (s) => STATUS_CONFIG[s] || STATUS_CONFIG.pending;

const normalizeOrderStatus = (raw) => {
  const s = (raw?.status || "").toString().toLowerCase().trim();
  if (s === "approved") return "confirmed";
  if (!s && raw?.approved === true) return "confirmed";
  if (s === "pending" && raw?.approved === true) return "confirmed";
  if (STATUS_CONFIG[s]) return s;
  return "pending";
};

const shouldMigrateToConfirmed = (raw) => {
  const s = (raw?.status || "").toString().toLowerCase().trim();
  return (
    s === "approved" ||
    (!s && raw?.approved === true) ||
    (s === "pending" && raw?.approved === true)
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HELPERS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const fmtPrice = (n) =>
  `Rs.${(Number(n) || 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;

const parseDate = (val) => {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val.seconds === "number") return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date(0) : d;
};

const relTime = (d) => {
  if (!d || d.getTime() === 0) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à¶¯à·à¶±à·Š";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-LK", { day: "2-digit", month: "short" });
};

const fullDate = (d) => {
  if (!d || d.getTime() === 0) return "-";
  return d.toLocaleString("en-LK", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const DEFAULT_IMG = "https://placehold.co/80x80/e2e8f0/64748b?text=No+Img";

const getItemImage = (item) => {
  if (!item) return DEFAULT_IMG;
  const pic = item.picture || item.photoURL || item.image || "";
  if (pic.startsWith("data:image") || pic.startsWith("http")) return pic;
  if (item.images?.[0]?.startsWith("data:image")) return item.images[0];
  return DEFAULT_IMG;
};

const getItemName = (item) =>
  item?.sinhalaName || item?.itemName || item?.name || "à¶±à¶¸ à¶±à·œà¶¸à·à¶­";
const getItemEnglishName = (item) => item?.name || "";
const getItemQty = (item) => Number(item?.qty) || Number(item?.quantity) || 1;
const getItemUnitPrice = (item) =>
  Number(item?.yourPrice) || Number(item?.unitPrice) || Number(item?.price) || 0;
const getItemTotal = (item) => {
  const explicit = Number(item?.total) || Number(item?.lineTotal) || 0;
  return explicit > 0 ? explicit : getItemUnitPrice(item) * getItemQty(item);
};
const isItemOOS = (item) => !!(item?.isOutOfStock || item?.outOfStock);
const extractOrderItems = (rawData) =>
  rawData.items || rawData.cartItems || rawData.products || rawData.orderItems || [];
const getOrderTotal = (order) => Number(order.grandTotal) || Number(order.total) || 0;
const getShortId = (id) => (id ? `#${id.slice(-6).toUpperCase()}` : "");

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GLOBAL MOBILE CSS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const MOBILE_CSS = `
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes slideUp {
    from { transform: translateY(100%); opacity: 0 }
    to   { transform: translateY(0); opacity: 1 }
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes slideDown {
    from { opacity: 0; transform: translateX(-50%) translateY(-12px) }
    to   { opacity: 1; transform: translateX(-50%) translateY(0) }
  }
  @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.6 } }
  @keyframes checkmark {
    0%   { transform: scale(0) rotate(-45deg); opacity: 0 }
    50%  { transform: scale(1.2) rotate(-45deg); opacity: 1 }
    100% { transform: scale(1) rotate(0deg); opacity: 1 }
  }

  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  ::-webkit-scrollbar { display: none }
  * { scrollbar-width: none }
  input, textarea, select { font-size: 16px !important; }

  .co-card { transition: transform 0.1s; }
  .co-card:active { transform: scale(0.985); }
  .co-btn { transition: all 0.15s; }
  .co-btn:active  { transform: scale(0.95); }
  .co-tab:active  { transform: scale(0.93); }
  .co-chip:active { transform: scale(0.92); }
`;

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TOAST
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const Toast = memo(({ message, type, show }) => {
  if (!show) return null;
  const bg =
    type === "success" ? "linear-gradient(135deg,#10b981,#059669)" :
    type === "error"   ? "linear-gradient(135deg,#ef4444,#dc2626)" :
    "linear-gradient(135deg,#3b82f6,#2563eb)";
  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed",
      top: "max(16px, env(safe-area-inset-top, 16px))",
      left: "50%", transform: "translateX(-50%)",
      background: bg, color: "white",
      padding: "12px 20px", borderRadius: 14,
      fontSize: 13, fontWeight: 700, zIndex: 99999,
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      animation: "slideDown .25s ease-out",
      maxWidth: "calc(100vw - 32px)", textAlign: "center",
    }}>
      {message}
    </div>
  );
});
Toast.displayName = "Toast";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   â˜… STATUS PROGRESS BAR
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const StatusProgress = memo(({ currentStatus }) => {
  const currentIdx = STATUS_PIPELINE.indexOf(currentStatus);
  const isCancelled = currentStatus === "cancelled";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 0" }}>
      {STATUS_PIPELINE.map((step, idx) => {
        const cfg = getStatusConfig(step);
        const isDone = !isCancelled && idx <= currentIdx;
        const isCurrent = !isCancelled && idx === currentIdx;
        return (
          <React.Fragment key={step}>
            {/* Dot */}
            <div style={{
              width: isCurrent ? 24 : 16,
              height: isCurrent ? 24 : 16,
              borderRadius: "50%",
              background: isDone ? cfg.color : "#e2e8f0",
              display: "flex", alignItems: "center",
              justifyContent: "center",
              fontSize: isCurrent ? 12 : 8,
              color: "white", fontWeight: 800,
              border: isCurrent ? `3px solid ${cfg.color}33` : "none",
              transition: "all 0.3s",
              flexShrink: 0,
            }}>
              {isDone ? cfg.icon : ""}
            </div>
            {/* Line */}
            {idx < STATUS_PIPELINE.length - 1 && (
              <div style={{
                flex: 1, height: 3, borderRadius: 2,
                background: !isCancelled && idx < currentIdx ? cfg.color : "#e2e8f0",
                transition: "background 0.3s",
              }} />
            )}
          </React.Fragment>
        );
      })}
      {isCancelled && (
        <div style={{
          marginLeft: 8, fontSize: 10, fontWeight: 700,
          color: "#dc2626", background: "#fef2f2",
          padding: "2px 8px", borderRadius: 6,
        }}>
          âŒ à¶…à·€à¶½à¶‚à¶œà·”
        </div>
      )}
    </div>
  );
});
StatusProgress.displayName = "StatusProgress";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   â˜… APPROVE DIALOG (bottom sheet)
   Shows order summary + items before approval
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ApproveDialog = memo(({ order, onConfirm, onCancel, loading }) => {
  if (!order) return null;

  const items = order.items || [];
  const grandTotal = getOrderTotal(order);
  const hasOOS = items.some(isItemOOS);
  const inStockItems = items.filter(i => !isItemOOS(i));
  const oosItems = items.filter(i => isItemOOS(i));
  const inStockTotal = inStockItems.reduce((s, i) => s + getItemTotal(i), 0);
  const totalUnits = items.reduce((s, i) => s + getItemQty(i), 0);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15,23,42,0.7)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end",
      justifyContent: "center", zIndex: 20000,
      animation: "fadeIn 0.15s ease-out",
    }} onClick={onCancel}>
      <div style={{
        background: "white",
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: "0",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        width: "100%", maxWidth: 500,
        maxHeight: "90vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.2)",
        animation: "slideUp 0.2s ease-out",
      }} onClick={e => e.stopPropagation()}>

        {/* Handle bar */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: "#d1d5db", margin: "10px auto 0",
          flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          padding: "14px 20px 12px",
          background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
          borderBottom: "1.5px solid #bbf7d0",
          flexShrink: 0,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>âœ…</div>
            <h3 style={{
              margin: 0, fontSize: 17, fontWeight: 800, color: "#166534",
            }}>
              à¶‡à¶«à·€à·”à¶¸ Approve à¶šà¶»à¶±à·Šà¶±à¶¯?
            </h3>
            <p style={{
              margin: "4px 0 0", fontSize: 11, color: "#15803d",
              lineHeight: 1.4,
            }}>
              Approve à¶šà·… à¶´à·ƒà·” POSInvoice Approved list à¶‘à¶šà·š à¶´à·™à¶±à·š
            </p>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "14px 18px",
          WebkitOverflowScrolling: "touch",
        }}>
          {/* Customer */}
          <div style={{
            background: "#f8fafc", borderRadius: 14, padding: 12,
            marginBottom: 12, border: "1px solid #e2e8f0",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 6,
            }}>
              <div style={{
                fontWeight: 700, fontSize: 14, color: "#1e293b",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 18 }}>ðŸ‘¤</span>
                <span style={{
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", maxWidth: 180,
                }}>
                  {order.customerName || "â€”"}
                </span>
              </div>
              <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace" }}>
                {getShortId(order.id)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              ðŸ“± {order.customerPhone || "-"}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
              ðŸ“… {fullDate(order._dateObj)}
            </div>
          </div>

          {/* Items summary */}
          <div style={{
            background: "white", borderRadius: 14,
            border: "1px solid #e2e8f0", overflow: "hidden",
            marginBottom: 12,
          }}>
            <div style={{
              padding: "10px 12px",
              background: "#f8fafc",
              borderBottom: "1px solid #f1f5f9",
              fontSize: 12, fontWeight: 700, color: "#475569",
              display: "flex", justifyContent: "space-between",
            }}>
              <span>ðŸ›’ à¶·à·à¶«à·Šà¶© {items.length} â€¢ à¶’à¶šà¶š {totalUnits}</span>
              {hasOOS && (
                <span style={{ color: "#f59e0b", fontSize: 10 }}>
                  âš ï¸ {oosItems.length} à¶­à·œà¶œ à¶±à·à¶­
                </span>
              )}
            </div>

            {items.map((item, idx) => {
              const name = getItemName(item);
              const qty = getItemQty(item);
              const total = getItemTotal(item);
              const oos = isItemOOS(item);
              const img = getItemImage(item);

              return (
                <div key={item.id || idx} style={{
                  padding: "8px 12px",
                  borderBottom: idx < items.length - 1 ? "1px solid #f8fafc" : "none",
                  display: "flex", gap: 8, alignItems: "center",
                  background: oos ? "#fffbeb" : "white",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    overflow: "hidden", flexShrink: 0,
                    border: oos ? "1.5px solid #fde68a" : "1px solid #e2e8f0",
                  }}>
                    <img src={img} alt="" style={{
                      width: "100%", height: "100%", objectFit: "cover",
                    }} onError={e => { e.target.src = DEFAULT_IMG; }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: "#1e293b",
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {name}
                      {oos && <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4 }}>(ðŸ“ž)</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      Ã—{qty}
                      {!oos && <span> â€¢ {fmtPrice(getItemUnitPrice(item))}</span>}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 800, fontSize: 13, flexShrink: 0,
                    color: oos ? "#d97706" : "#1e40af",
                    fontFamily: "monospace",
                  }}>
                    {oos ? "ðŸ“ž" : fmtPrice(total)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* OOS warning */}
          {hasOOS && (
            <div style={{
              background: "#fffbeb", border: "1.5px solid #fde68a",
              borderRadius: 12, padding: "10px 14px", marginBottom: 12,
              fontSize: 11, color: "#92400e", lineHeight: 1.5,
            }}>
              âš ï¸ <b>{oosItems.length}</b> à¶·à·à¶«à·Šà¶©(à¶š) à¶­à·œà¶œ à¶±à·œà¶¸à·à¶­ â€” à¶¸à·’à¶½
              à¶´à·ƒà·”à·€ à¶¯à·à¶±à·”à¶¸à·Š à¶¯à·™à¶±à·” à¶½à·à¶¶à·š
            </div>
          )}

          {/* Total */}
          <div style={{
            background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
            borderRadius: 14, padding: 14,
            border: "1.5px solid #bbf7d0",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 18, fontWeight: 900, color: "#16a34a",
            }}>
              <span>à¶¸à·”à·…à·” à¶‘à¶šà¶­à·”à·€</span>
              <span style={{ fontFamily: "monospace" }}>{fmtPrice(grandTotal)}</span>
            </div>
            {hasOOS && inStockTotal !== grandTotal && (
              <div style={{
                fontSize: 10, color: "#15803d", marginTop: 6,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>à¶­à·œà¶œ à¶‡à¶­à·’ à¶·à·à¶«à·Šà¶© ({inStockItems.length})</span>
                <span>{fmtPrice(inStockTotal)}</span>
              </div>
            )}
          </div>

          {/* What happens next */}
          <div style={{
            background: "#eff6ff", borderRadius: 12,
            padding: "10px 14px", marginTop: 12,
            border: "1px solid #bfdbfe",
            fontSize: 11, color: "#1e40af", lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              âœ… Approve à¶šà·… à¶´à·ƒà·”:
            </div>
            â€¢ POSInvoice Approved list à¶‘à¶šà·š à¶´à·™à¶±à·š<br />
            â€¢ à¶´à·à¶»à·’à¶·à·à¶œà·’à¶šà¶ºà·à¶œà·š Portal à¶‘à¶šà·š status update à·€à·š<br />
            â€¢ à¶Šà·…à¶Ÿ à¶´à·’à¶ºà·€à¶»: Processing â†’ Ship â†’ Deliver
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: "12px 18px", borderTop: "1px solid #f1f5f9",
          display: "flex", gap: 10, flexShrink: 0,
        }}>
          <button className="co-btn" onClick={onCancel} style={{
            flex: 1, padding: "14px 0", background: "#f1f5f9",
            color: "#64748b", border: "1px solid #e2e8f0",
            borderRadius: 14, fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            à¶…à·€à¶½à¶‚à¶œà·”
          </button>
          <button
            className="co-btn"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 2, padding: "14px 0",
              background: loading ? "#94a3b8" : "linear-gradient(135deg,#16a34a,#15803d)",
              color: "white", border: "none", borderRadius: 14,
              fontWeight: 800, fontSize: 15, cursor: loading ? "wait" : "pointer",
              boxShadow: loading ? "none" : "0 4px 14px rgba(22,163,74,0.3)",
              display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
              ...(loading ? { animation: "pulse 1.2s infinite" } : {}),
            }}
          >
            {loading ? "â³ Approving..." : "âœ… Approve à¶šà¶»à¶±à·Šà¶±"}
          </button>
        </div>
      </div>
    </div>
  );
});
ApproveDialog.displayName = "ApproveDialog";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DELETE CONFIRM DIALOG
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const DeleteConfirmDialog = memo(({ order, onConfirm, onCancel }) => {
  if (!order) return null;
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15,23,42,0.7)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end",
      justifyContent: "center", zIndex: 20000,
      animation: "fadeIn 0.15s ease-out",
    }} onClick={onCancel}>
      <div style={{
        background: "white",
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: "24px 20px",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        width: "100%", maxWidth: 500,
        boxShadow: "0 -10px 40px rgba(0,0,0,0.2)",
        animation: "slideUp 0.2s ease-out",
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: "#d1d5db", margin: "0 auto 18px",
        }} />
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 48 }}>ðŸ—‘ï¸</div>
          <h3 style={{ margin: "10px 0 6px", fontSize: 17, fontWeight: 800, color: "#991b1b" }}>
            à¶¸à·™à¶¸ à¶‡à¶«à·€à·”à¶¸ à¶¸à¶šà¶±à·Šà¶±à¶¯?
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            âš ï¸ à¶¸à·™à¶º à¶†à¶´à·ƒà·” à·„à·à¶»à·€à·’à¶º à¶±à·œà·„à·à¶š
          </p>
        </div>
        <div style={{
          background: "#fef2f2", borderRadius: 14, padding: "12px 14px",
          marginBottom: 20, border: "1px solid #fecaca",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>
                ðŸ‘¤ {order.customerName || "â€”"}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                {getShortId(order.id)} â€¢ {(order.items || []).length} à¶·à·à¶«à·Šà¶©
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#dc2626", fontFamily: "monospace" }}>
              {fmtPrice(getOrderTotal(order))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="co-btn" onClick={onCancel} style={{
            flex: 1, padding: "14px 0", background: "#f1f5f9",
            color: "#64748b", border: "1px solid #e2e8f0",
            borderRadius: 14, fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            à¶…à·€à¶½à¶‚à¶œà·”
          </button>
          <button className="co-btn" onClick={onConfirm} style={{
            flex: 2, padding: "14px 0", background: "#dc2626",
            color: "white", border: "none", borderRadius: 14,
            fontWeight: 800, fontSize: 15, cursor: "pointer",
          }}>
            ðŸ—‘ï¸ à¶¸à¶šà¶±à·Šà¶±
          </button>
        </div>
      </div>
    </div>
  );
});
DeleteConfirmDialog.displayName = "DeleteConfirmDialog";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ORDER CARD
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const OrderCard = memo(({ order, onClick, onQuickApprove, actionLoading }) => {
  const status = getStatusConfig(order.status);
  const items = order.items || [];
  const totalUnits = items.reduce((s, i) => s + getItemQty(i), 0);
  const grandTotal = getOrderTotal(order);
  const hasOOS = items.some(isItemOOS);
  const canApprove = order.status === "pending";

  return (
    <div className="co-card" style={{
      background: "white", borderRadius: 16,
      padding: "12px 12px 14px", marginBottom: 10,
      border: "1px solid #e2e8f0",
      borderLeft: `4px solid ${status.color}`,
      boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <div
        onClick={() => onClick(order)}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(order); } }}
        style={{ cursor: "pointer" }}
      >
        {/* Top row */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 6,
        }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <div style={{
              fontWeight: 700, fontSize: 14, color: "#0f172a",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              ðŸ‘¤ {order.customerName || "à¶±à¶¸ à¶±à·œà¶¸à·à¶­"}
            </div>
            <div style={{
              fontSize: 11, color: "#475569", marginTop: 2,
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <span>ðŸ“± {order.customerPhone || "-"}</span>
              <span style={{ fontSize: 9, color: "#94a3b8" }}>
                {relTime(order._dateObj)}
              </span>
            </div>
          </div>
          <span style={{
            padding: "3px 8px", borderRadius: 8,
            fontSize: 9, fontWeight: 700,
            color: status.color, background: status.bg,
            border: `1px solid ${status.border}`,
          }}>
            {status.icon} {status.si}
          </span>
        </div>

        {/* Status progress */}
        <div style={{ marginBottom: 8 }}>
          <StatusProgress currentStatus={order.status} />
        </div>

        {/* Items preview */}
        <div style={{
          background: "#f8fafc", borderRadius: 10,
          padding: "8px 10px", marginBottom: 8,
          border: "1px solid #f1f5f9",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#475569",
            marginBottom: 4,
          }}>
            ðŸ›’ à¶·à·à¶«à·Šà¶© {items.length} â€¢ à¶’à¶šà¶š {totalUnits}
            {hasOOS && <span style={{ marginLeft: 6, color: "#f59e0b" }}>âš ï¸ðŸ“ž</span>}
          </div>
          {items.length === 0 ? (
            <div style={{
              fontSize: 11, color: "#ef4444", padding: 6,
              textAlign: "center", background: "#fef2f2", borderRadius: 6,
            }}>
              âš ï¸ Items à¶±à·œà¶¸à·à¶­
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {items.slice(0, 3).map((item, idx) => (
                <div key={item.id || idx} style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "2px 0", gap: 4,
                }}>
                  <div style={{
                    flex: 1, fontSize: 11, fontWeight: 600, color: "#1e293b",
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", minWidth: 0,
                  }}>
                    â€¢ {getItemName(item)}
                    {isItemOOS(item) && <span style={{ fontSize: 9, color: "#f59e0b" }}> (ðŸ“ž)</span>}
                  </div>
                  <span style={{
                    background: "#dbeafe", color: "#1d4ed8",
                    fontWeight: 800, padding: "1px 5px",
                    borderRadius: 4, fontSize: 9, flexShrink: 0,
                  }}>
                    Ã—{getItemQty(item)}
                  </span>
                  <span style={{
                    fontWeight: 700, fontSize: 10, color: "#0f172a",
                    minWidth: 50, textAlign: "right", flexShrink: 0,
                    fontFamily: "monospace",
                  }}>
                    {isItemOOS(item) ? "ðŸ“ž" : fmtPrice(getItemTotal(item))}
                  </span>
                </div>
              ))}
              {items.length > 3 && (
                <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 600, textAlign: "center", paddingTop: 2 }}>
                  +{items.length - 3} à¶­à·€à¶­à·Š...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Total */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 9, color: "#cbd5e1", fontFamily: "monospace" }}>
            {getShortId(order.id)}
          </div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#16a34a", fontFamily: "monospace" }}>
            {fmtPrice(grandTotal)}
          </div>
        </div>
      </div>

      {/* â˜… Quick approve button */}
      {canApprove && (
        <button
          className="co-btn"
          onClick={(e) => { e.stopPropagation(); onQuickApprove(order); }}
          disabled={actionLoading}
          style={{
            width: "100%", marginTop: 10, padding: 12,
            background: actionLoading ? "#94a3b8" : "linear-gradient(135deg, #16a34a, #15803d)",
            color: "white", border: "none", borderRadius: 12,
            fontWeight: 800, fontSize: 13,
            cursor: actionLoading ? "wait" : "pointer",
            boxShadow: actionLoading ? "none" : "0 4px 12px rgba(22,163,74,0.25)",
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 6,
            ...(actionLoading ? { animation: "pulse 1.2s infinite" } : {}),
          }}
        >
          {actionLoading ? "â³ ..." : "âœ… Approve à¶šà¶»à¶±à·Šà¶±"}
        </button>
      )}
    </div>
  );
});
OrderCard.displayName = "OrderCard";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MODAL ITEM ROW
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ModalItemRow = memo(({ item, isLast }) => {
  const name = getItemName(item);
  const engName = getItemEnglishName(item);
  const qty = getItemQty(item);
  const unitPrice = getItemUnitPrice(item);
  const total = getItemTotal(item);
  const oos = isItemOOS(item);
  const img = getItemImage(item);

  return (
    <div style={{
      padding: "10px 12px",
      borderBottom: !isLast ? "1px solid #f1f5f9" : "none",
      display: "flex", gap: 10, alignItems: "center",
      background: oos ? "#fffbeb" : "white",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        overflow: "hidden", background: "#f8fafc",
        border: oos ? "1.5px solid #fde68a" : "1px solid #e2e8f0",
        flexShrink: 0,
      }}>
        <img src={img} alt={name} loading="lazy" style={{
          width: "100%", height: "100%", objectFit: "cover",
        }} onError={e => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: 13, color: "#0f172a",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
        </div>
        {name !== engName && engName && (
          <div style={{
            fontSize: 10, color: "#94a3b8", marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {engName}
          </div>
        )}
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            background: "#dbeafe", color: "#1d4ed8",
            fontWeight: 800, padding: "2px 8px", borderRadius: 6, fontSize: 11,
          }}>Ã—{qty}</span>
          {!oos && <span style={{ fontSize: 11, color: "#64748b" }}>@ {fmtPrice(unitPrice)}</span>}
          {oos && (
            <span style={{
              fontSize: 10, color: "#d97706", background: "#fffbeb",
              padding: "2px 6px", borderRadius: 4, border: "1px solid #fde68a",
            }}>ðŸ“ž à¶¸à·’à¶½ à·ƒà¶³à·„à· à¶…à¶¸à¶­à¶±à·Šà¶±</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontWeight: 800, fontSize: 14,
          color: oos ? "#d97706" : "#1e40af", fontFamily: "monospace",
        }}>
          {oos ? "ðŸ“ž" : fmtPrice(total)}
        </div>
      </div>
    </div>
  );
});
ModalItemRow.displayName = "ModalItemRow";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ORDER DETAIL MODAL
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const OrderDetailModal = memo(({
  order, onClose, onStatusChange, onDelete,
  onApproveRequest, actionLoading,
}) => {
  const status = getStatusConfig(order.status);
  const items = order.items || [];
  const grandTotal = getOrderTotal(order);
  const hasOOS = items.some(isItemOOS);
  const modalRef = useRef(null);
  const nextConfig = status.next ? getStatusConfig(status.next) : null;
  const canCancel = order.status !== "cancelled" && order.status !== "delivered";
  const isPending = order.status === "pending";

  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = o; };
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => { modalRef.current?.focus(); }, []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end",
      justifyContent: "center", zIndex: 9999,
      backdropFilter: "blur(4px)",
      animation: "fadeIn 0.15s ease-out",
    }} onClick={onClose} role="dialog" aria-modal="true">
      <div
        ref={modalRef} tabIndex={-1}
        style={{
          background: "white", width: "100%", maxWidth: 500,
          maxHeight: "92vh",
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          overflow: "hidden", display: "flex", flexDirection: "column",
          animation: "slideUp .25s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.2)",
          outline: "none",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: "#d1d5db", margin: "10px auto 0", flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              ðŸ“‹ à¶‡à¶«à·€à·”à¶¸à·Š à·€à·’à·ƒà·Šà¶­à¶»
            </h3>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {getShortId(order.id)} â€¢ {fullDate(order._dateObj)}
            </div>
          </div>
          <button className="co-btn" onClick={onClose} aria-label="Close" style={{
            background: "#f1f5f9", border: "none",
            width: 34, height: 34, borderRadius: 10,
            fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
          }}>âœ•</button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px 14px",
          WebkitOverflowScrolling: "touch",
        }}>
          {/* Customer */}
          <div style={{
            background: "#f8fafc", borderRadius: 14, padding: 12,
            marginBottom: 12, border: "1px solid #e2e8f0",
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", wordBreak: "break-word" }}>
              ðŸ‘¤ {order.customerName || "à¶±à¶¸ à¶±à·œà¶¸à·à¶­"}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
              ðŸ“± {order.customerPhone || "-"}
            </div>
            {order.customerAddress && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, wordBreak: "break-word" }}>
                ðŸ“ {order.customerAddress}
              </div>
            )}
            {order.orderNote && (
              <div style={{
                fontSize: 12, color: "#64748b", marginTop: 6,
                background: "#fef9c3", padding: "6px 10px",
                borderRadius: 8, border: "1px solid #fde68a",
              }}>
                ðŸ“ {order.orderNote}
              </div>
            )}
          </div>

          {/* Status + progress */}
          <div style={{
            background: "#f8fafc", borderRadius: 14, padding: 12,
            marginBottom: 12, border: "1px solid #e2e8f0",
          }}>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 10,
              flexWrap: "wrap", gap: 8,
            }}>
              <span style={{
                padding: "6px 14px", borderRadius: 10,
                fontSize: 13, fontWeight: 700,
                color: status.color, background: status.bg,
                border: `1px solid ${status.border}`,
              }}>
                {status.icon} {status.si}
              </span>

              {/* Non-pending status change */}
              {!isPending && nextConfig && (
                <button className="co-btn"
                  onClick={() => onStatusChange(order.id, status.next)}
                  disabled={actionLoading}
                  style={{
                    padding: "7px 14px",
                    background: actionLoading ? "#94a3b8" : nextConfig.color,
                    color: "white", border: "none", borderRadius: 10,
                    fontWeight: 700, fontSize: 12,
                    cursor: actionLoading ? "wait" : "pointer",
                  }}
                >
                  {nextConfig.icon} {status.nextLabelSi}
                </button>
              )}
            </div>

            <StatusProgress currentStatus={order.status} />

            {order.status === "confirmed" && (
              <div style={{
                marginTop: 8, fontSize: 11, color: "#16a34a",
                background: "#f0fdf4", border: "1px solid #bbf7d0",
                padding: "6px 10px", borderRadius: 8, fontWeight: 700,
              }}>
                âœ… POSInvoice Approved list à¶‘à¶šà·š à¶´à·™à¶±à·š
              </div>
            )}

            {order.approvedAt && (
              <div style={{
                marginTop: 6, fontSize: 10, color: "#64748b",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                âœ… Approved: {fullDate(parseDate(order.approvedAt))}
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 14, fontWeight: 800, marginBottom: 8, color: "#0f172a",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              ðŸ›’ à¶·à·à¶«à·Šà¶© ({items.length})
              {hasOOS && (
                <span style={{ fontSize: 11, color: "#d97706", fontWeight: 500 }}>
                  âš ï¸ à¶­à·œà¶œ à¶±à·à¶­ à¶‡à¶­à·”à·…à¶­à·Š
                </span>
              )}
            </div>
            {items.length === 0 ? (
              <div style={{
                background: "#fef2f2", padding: 20, borderRadius: 14, textAlign: "center",
              }}>
                <div style={{ fontSize: 32 }}>âš ï¸</div>
                <div style={{ fontSize: 13, color: "#dc2626", fontWeight: 700, marginTop: 6 }}>
                  à¶·à·à¶«à·Šà¶© data à¶±à·œà¶¸à·à¶­
                </div>
              </div>
            ) : (
              <div style={{
                background: "white", borderRadius: 14,
                border: "1px solid #e2e8f0", overflow: "hidden",
              }}>
                {items.map((item, idx) => (
                  <ModalItemRow key={item.id || idx} item={item} isLast={idx === items.length - 1} />
                ))}
              </div>
            )}
          </div>

          {hasOOS && (
            <div style={{
              background: "#fffbeb", border: "1.5px solid #fde68a",
              borderRadius: 10, padding: "8px 12px", marginBottom: 12,
              fontSize: 11, color: "#92400e",
            }}>
              ðŸ“ž à¶­à·œà¶œ à¶±à·œà¶¸à·à¶­à·’ à¶·à·à¶«à·Šà¶© à·ƒà¶³à·„à· à¶¸à·’à¶½ à¶´à·ƒà·”à·€ à¶¯à·à¶±à·”à¶¸à·Š à¶¯à·™à¶±à·” à¶½à·à¶¶à·š.
            </div>
          )}

          {/* Grand total */}
          <div style={{
            background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
            borderRadius: 14, padding: 14,
            border: "1.5px solid #bbf7d0", marginBottom: 12,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 20, fontWeight: 900, color: "#16a34a",
            }}>
              <span>à¶¸à·”à·…à·” à¶‘à¶šà¶­à·”à·€</span>
              <span style={{ fontFamily: "monospace" }}>{fmtPrice(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 14px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          borderTop: "1px solid #f1f5f9",
          display: "flex", gap: 8, flexShrink: 0, background: "white",
        }}>
          {/* â˜… Approve button for pending */}
          {isPending && (
            <button className="co-btn"
              onClick={() => onApproveRequest(order)}
              disabled={actionLoading}
              style={{
                flex: 1, padding: 13,
                background: actionLoading ? "#94a3b8" : "linear-gradient(135deg,#16a34a,#15803d)",
                color: "white", border: "none", borderRadius: 14,
                fontWeight: 800, fontSize: 13,
                cursor: actionLoading ? "wait" : "pointer",
                boxShadow: actionLoading ? "none" : "0 4px 12px rgba(22,163,74,0.3)",
                display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6,
              }}
            >
              âœ… Approve à¶šà¶»à¶±à·Šà¶±
            </button>
          )}

          {/* Non-pending next status */}
          {!isPending && nextConfig && (
            <button className="co-btn"
              onClick={() => onStatusChange(order.id, status.next)}
              disabled={actionLoading}
              style={{
                flex: 1, padding: 13,
                background: actionLoading ? "#94a3b8" : nextConfig.color,
                color: "white", border: "none", borderRadius: 14,
                fontWeight: 700, fontSize: 13,
                cursor: actionLoading ? "wait" : "pointer",
                boxShadow: actionLoading ? "none" : `0 4px 12px ${nextConfig.color}40`,
              }}
            >
              {nextConfig.icon} {status.nextLabelSi}
            </button>
          )}

          {canCancel && (
            <button className="co-btn"
              onClick={() => onStatusChange(order.id, "cancelled")}
              disabled={actionLoading}
              style={{
                padding: "13px 16px", background: "#fef9c3",
                color: "#92400e", border: "1px solid #fde68a",
                borderRadius: 14, fontWeight: 700, fontSize: 16,
                cursor: actionLoading ? "wait" : "pointer",
                flexShrink: 0,
              }}
            >âŒ</button>
          )}
          <button className="co-btn"
            onClick={() => onDelete(order.id)}
            disabled={actionLoading}
            style={{
              padding: "13px 16px", background: "#fef2f2",
              color: "#dc2626", border: "1px solid #fecaca",
              borderRadius: 14, fontWeight: 700, fontSize: 16,
              cursor: actionLoading ? "wait" : "pointer",
              flexShrink: 0,
            }}
          >ðŸ—‘ï¸</button>
        </div>
      </div>
    </div>
  );
});
OrderDetailModal.displayName = "OrderDetailModal";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   â˜…â˜…â˜… MAIN COMPONENT â˜…â˜…â˜…
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function CustomerOrders() {
  const { user } = useUserAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "info" });

  // â˜… Dialog states
  const [approveTarget, setApproveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const toastTimerRef = useRef(null);
  const migratedRef = useRef(new Set());

  const showToast = useCallback((message, type = "info") => {
    setToast({ show: true, message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setToast(p => ({ ...p, show: false })), 3000
    );
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  /* â•â•â• LOAD ORDERS â•â•â• */
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const path = `shops/${user.uid}/pfis`;
    const unsub = onSnapshot(collection(db, path),
      async (snapshot) => {
        if (snapshot.empty) { setOrders([]); setLoading(false); return; }
        const legacyIds = [];
        const loaded = snapshot.docs.map(docSnap => {
          const raw = docSnap.data();
          const normalizedStatus = normalizeOrderStatus(raw);
          if (shouldMigrateToConfirmed(raw) && !migratedRef.current.has(docSnap.id))
            legacyIds.push(docSnap.id);
          return {
            id: docSnap.id,
            _dateObj: parseDate(raw.createdAt || raw.date),
            ...raw,
            status: normalizedStatus,
            items: extractOrderItems(raw),
          };
        });
        loaded.sort((a, b) => (b._dateObj?.getTime() || 0) - (a._dateObj?.getTime() || 0));
        setOrders(loaded);
        setSelectedOrder(prev => prev ? loaded.find(o => o.id === prev.id) || null : null);

        if (legacyIds.length > 0) {
          try {
            await Promise.all(legacyIds.map(async id => {
              migratedRef.current.add(id);
              await updateDoc(doc(db, `shops/${user.uid}/pfis`, id), {
                status: "confirmed", approved: true, updatedAt: new Date().toISOString(),
              });
            }));
            showToast("âœ… à¶´à¶»à¶« Approved orders sync à·€à·’à¶º", "success");
          } catch (err) { console.warn("Legacy migration:", err); }
        }
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        showToast("à¶¯à¶­à·Šà¶­ à¶½à¶¶à· à¶œà·à¶±à·“à¶¸à·š à¶¯à·à·‚à¶ºà¶šà·Š!", "error");
        setLoading(false);
      }
    );
    const timeout = setTimeout(() => setLoading(false), 8000);
    return () => { unsub(); clearTimeout(timeout); };
  }, [user?.uid, showToast]);

  /* â•â•â• STATUS UPDATE â•â•â• */
  const updateStatus = useCallback(async (orderId, newStatus) => {
    if (!user?.uid || actionLoading) return;
    const prevOrder = orders.find(o => o.id === orderId);
    const prevStatus = prevOrder?.status;
    setActionLoading(true);

    // Optimistic
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setSelectedOrder(prev => prev?.id === orderId ? { ...prev, status: newStatus } : prev);

    try {
      const payload = { status: newStatus, updatedAt: new Date().toISOString() };
      if (newStatus === "confirmed") {
        payload.approved = true;
        payload.approvedAt = serverTimestamp();
        payload.approvedBy = user?.email || user?.displayName || "";
      }
      if (newStatus === "processing") payload.processingAt = serverTimestamp();
      if (newStatus === "shipped") payload.shippedAt = serverTimestamp();
      if (newStatus === "delivered") payload.deliveredAt = serverTimestamp();
      if (newStatus === "cancelled") payload.cancelledAt = serverTimestamp();

      await updateDoc(doc(db, `shops/${user.uid}/pfis`, orderId), payload);
      const si = getStatusConfig(newStatus);
      showToast(`${si.icon} à¶‡à¶«à·€à·”à¶¸ ${si.si} à¶šà¶»à¶± à¶½à¶¯à·“`, "success");
    } catch (err) {
      console.error("Status update failed:", err);
      if (prevStatus) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: prevStatus } : o));
        setSelectedOrder(prev => prev?.id === orderId ? { ...prev, status: prevStatus } : prev);
      }
      showToast("Status update à¶…à·ƒà·à¶»à·Šà¶®à¶šà¶ºà·’.", "error");
    } finally {
      setActionLoading(false);
    }
  }, [user, actionLoading, orders, showToast]);

  /* â•â•â• â˜… APPROVE FLOW â•â•â• */
  const handleApproveRequest = useCallback((order) => {
    setApproveTarget(order);
  }, []);

  const handleApproveConfirm = useCallback(async () => {
    if (!approveTarget) return;
    const orderId = approveTarget.id;
    setApproveTarget(null);
    setSelectedOrder(null);
    await updateStatus(orderId, "confirmed");
  }, [approveTarget, updateStatus]);

  /* â•â•â• â˜… DELETE FLOW â•â•â• */
  const handleDeleteRequest = useCallback((orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (order) setDeleteTarget(order);
  }, [orders]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !user?.uid || actionLoading) return;
    const orderId = deleteTarget.id;
    const deleted = deleteTarget;
    setDeleteTarget(null);
    setActionLoading(true);
    setSelectedOrder(null);
    setOrders(prev => prev.filter(o => o.id !== orderId));

    try {
      await deleteDoc(doc(db, `shops/${user.uid}/pfis`, orderId));
      showToast("ðŸ—‘ï¸ à¶‡à¶«à·€à·”à¶¸ à¶¸à¶šà· à¶¯à·à¶¸à·“à¶º", "success");
    } catch (err) {
      console.error("Delete failed:", err);
      setOrders(prev => {
        const restored = [...prev, deleted];
        restored.sort((a, b) => (b._dateObj?.getTime() || 0) - (a._dateObj?.getTime() || 0));
        return restored;
      });
      showToast("à¶¸à·à¶šà·“à¶¸ à¶…à·ƒà·à¶»à·Šà¶®à¶šà¶ºà·’.", "error");
    } finally { setActionLoading(false); }
  }, [deleteTarget, user?.uid, actionLoading, showToast]);

  /* â•â•â• FILTERS â•â•â• */
  const filtered = useMemo(() => {
    let result = orders;
    if (dateRange !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      result = result.filter(o => {
        const d = o._dateObj || new Date(0);
        if (dateRange === "today") return d >= today;
        if (dateRange === "week") return d >= new Date(today.getTime() - 7 * 86400000);
        if (dateRange === "month") return d >= new Date(today.getTime() - 30 * 86400000);
        return true;
      });
    }
    if (statusFilter !== "all") result = result.filter(o => o.status === statusFilter);
    if (searchTerm.trim()) {
      const words = searchTerm.toLowerCase().split(/\s+/);
      result = result.filter(o => {
        const text = [o.customerName, o.customerPhone, o.id, ...(o.items || []).map(i => getItemName(i))]
          .filter(Boolean).join(" ").toLowerCase();
        return words.every(w => text.includes(w));
      });
    }
    return result;
  }, [orders, statusFilter, searchTerm, dateRange]);

  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    return {
      total: orders.length,
      approved: orders.filter(o => o.status === "confirmed").length,
      pending: orders.filter(o => o.status === "pending").length,
      today: orders.filter(o => (o._dateObj || new Date(0)).toDateString() === todayStr).length,
      revenue: orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + getOrderTotal(o), 0),
    };
  }, [orders]);

  const statusCounts = useMemo(() => {
    const c = {};
    orders.forEach(o => { c[o.status || "pending"] = (c[o.status || "pending"] || 0) + 1; });
    return c;
  }, [orders]);

  const handleOrderClick = useCallback(order => setSelectedOrder(order), []);
  const handleCloseModal = useCallback(() => setSelectedOrder(null), []);

  /* â•â•â• LOADING / AUTH â•â•â• */
  if (!user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <style>{MOBILE_CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>ðŸ”’</div>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>Login à¶šà¶»à¶±à·Šà¶±</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <style>{MOBILE_CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 36, height: 36, border: "3px solid #e2e8f0",
          borderTopColor: "#3b82f6", borderRadius: "50%",
          animation: "spin 1s linear infinite", margin: "0 auto",
        }} />
        <p style={{ color: "#64748b", marginTop: 12, fontSize: 13 }}>à¶‡à¶«à·€à·”à¶¸à·Š à¶½à¶¶à· à¶œà¶±à·’à¶¸à·’à¶±à·Š...</p>
      </div>
    </div>
  );

  /* â•â•â• RENDER â•â•â• */
  return (
    <div style={{
      width: "100%", maxWidth: 500, margin: "0 auto",
      background: "#f8fafc", minHeight: "100vh",
      overflowX: "hidden", boxSizing: "border-box",
    }}>
      <style>{MOBILE_CSS}</style>
      <Toast message={toast.message} type={toast.type} show={toast.show} />

      {/* â˜… Dialogs */}
      {approveTarget && (
        <ApproveDialog
          order={approveTarget}
          onConfirm={handleApproveConfirm}
          onCancel={() => setApproveTarget(null)}
          loading={actionLoading}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          order={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #1e40af, #3b82f6)",
        padding: "max(20px, env(safe-area-inset-top, 20px)) 16px 16px",
        color: "white",
        borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
      }}>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>ðŸ“‹</span>
          à¶´à·à¶»à·’à¶·à·à¶œà·’à¶š à¶‡à¶«à·€à·”à¶¸à·Š
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#bfdbfe" }}>
          {orders.length} à¶‡à¶«à·€à·”à¶¸à·Š â€¢ {stats.approved} Approved â€¢ {stats.pending} Pending
        </p>
      </header>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "12px 12px 0" }}>
        {[
          { v: stats.pending, l: "Pending", c: "#f59e0b", bg: "#fefce8", i: "â³" },
          { v: stats.approved, l: "Approved", c: "#16a34a", bg: "#f0fdf4", i: "âœ…" },
          { v: stats.today, l: "à¶…à¶¯", c: "#2563eb", bg: "#eff6ff", i: "ðŸ“…" },
          { v: `${(stats.revenue / 1000).toFixed(0)}K`, l: "à¶†à¶¯à·à¶ºà¶¸", c: "#7c3aed", bg: "#faf5ff", i: "ðŸ’°" },
        ].map((s, i) => (
          <div key={i} style={{
            borderRadius: 12, padding: "8px 4px", textAlign: "center",
            border: "1px solid #e2e8f0", background: s.bg,
          }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{s.i}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "10px 12px 6px" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>ðŸ”</span>
          <input type="text" placeholder="à¶±à¶¸, à¶¯à·”à¶»à¶šà¶®à¶±, à¶·à·à¶«à·Šà¶© à·ƒà·œà¶ºà¶±à·Šà¶±..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: "100%", padding: "11px 36px", borderRadius: 14,
              border: "1.5px solid #cbd5e1", fontSize: 14, outline: "none",
              boxSizing: "border-box", background: "white", WebkitAppearance: "none",
            }}
          />
          {searchTerm && (
            <button className="co-btn" onClick={() => setSearchTerm("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "#e2e8f0", border: "none", borderRadius: "50%",
              width: 24, height: 24, cursor: "pointer", fontSize: 10,
              display: "flex", alignItems: "center", justifyContent: "center", color: "#475569",
            }}>âœ•</button>
          )}
        </div>
      </div>

      {/* Date filter */}
      <div style={{
        padding: "4px 12px", display: "flex", gap: 4,
        overflowX: "auto", scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}>
        {[
          { k: "all", l: "à·ƒà·’à¶ºà¶½à·Šà¶½" }, { k: "today", l: "à¶…à¶¯" },
          { k: "week", l: "à·ƒà¶­à·’à¶º" }, { k: "month", l: "à¶¸à·à·ƒà¶º" },
        ].map(({ k, l }) => (
          <button key={k} className="co-chip" onClick={() => setDateRange(k)} style={{
            padding: "7px 12px", borderRadius: 10, border: "none",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0,
            background: dateRange === k ? "#1e40af" : "#f1f5f9",
            color: dateRange === k ? "white" : "#475569",
            boxShadow: dateRange === k ? "0 2px 8px rgba(30,64,175,0.3)" : "none",
          }}>{l}</button>
        ))}
      </div>

      {/* Status filter */}
      <div style={{
        display: "flex", gap: 4, overflowX: "auto",
        padding: "8px 12px", scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}>
        <button className="co-chip" onClick={() => setStatusFilter("all")} style={{
          padding: "6px 10px", borderRadius: 10, fontSize: 10,
          fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          background: statusFilter === "all" ? "#1e40af" : "white",
          color: statusFilter === "all" ? "white" : "#475569",
          border: statusFilter === "all" ? "none" : "1px solid #e2e8f0",
          boxShadow: statusFilter === "all" ? "0 2px 8px rgba(30,64,175,0.3)" : "none",
        }}>
          ðŸ“‹ à·ƒà·’à¶ºà¶½à·Šà¶½ ({orders.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const count = statusCounts[key] || 0;
          if (count === 0) return null;
          return (
            <button key={key} className="co-chip" onClick={() => setStatusFilter(key)} style={{
              padding: "6px 10px", borderRadius: 10, fontSize: 10,
              fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              background: statusFilter === key ? cfg.color : "white",
              color: statusFilter === key ? "white" : "#475569",
              border: statusFilter === key ? "none" : "1px solid #e2e8f0",
              boxShadow: statusFilter === key ? `0 2px 8px ${cfg.color}40` : "none",
            }}>
              {cfg.icon} {cfg.si} ({count})
            </button>
          );
        })}
      </div>

      {/* Results count */}
      <div style={{ padding: "0 14px 6px", fontSize: 11, color: "#94a3b8" }}>
        à¶´à·Šâ€à¶»à¶­à·’à¶µà¶½: <b style={{ color: "#475569" }}>{filtered.length}</b> / {orders.length}
      </div>

      {/* Order list */}
      <main style={{ padding: "0 12px 100px" }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "white", borderRadius: 18, border: "1px solid #e2e8f0",
          }}>
            <div style={{ fontSize: 56 }}>ðŸ“­</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", margin: "12px 0 6px" }}>
              à¶‡à¶«à·€à·”à¶¸à·Š à¶±à·œà¶¸à·à¶­
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              {orders.length === 0 ? "à¶´à·à¶»à·’à¶·à·à¶œà·’à¶šà¶ºà·’à¶±à·Š à¶­à·€à¶¸ à¶‡à¶«à·€à·”à¶¸à·Š à¶šà¶» à¶±à·à¶­" : "Filter à·€à·™à¶±à·ƒà·Š à¶šà¶»à¶±à·Šà¶±"}
            </p>
          </div>
        ) : (
          filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={handleOrderClick}
              onQuickApprove={handleApproveRequest}
              actionLoading={actionLoading}
            />
          ))
        )}
      </main>

      {/* Detail modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={handleCloseModal}
          onStatusChange={updateStatus}
          onDelete={handleDeleteRequest}
          onApproveRequest={handleApproveRequest}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}



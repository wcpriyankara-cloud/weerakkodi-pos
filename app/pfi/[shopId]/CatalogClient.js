// catalog/app/pfi/[shopId]/CatalogClient.js
'use client';

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  memo,
} from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ══════════════════════════════════════
// FIREBASE INIT
// ══════════════════════════════════════
function getDb() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = getApps().length === 0
    ? initializeApp(config)
    : getApps()[0];

  return getFirestore(app);
}

// ══════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════
const DEFAULT_IMG = 'https://placehold.co/300x300/e2e8f0/64748b?text=No+Image';

const SORT_OPTIONS = [
  { key: 'default', label: 'පෙරනිමි' },
  { key: 'priceLow', label: 'මිල ↑' },
  { key: 'priceHigh', label: 'මිල ↓' },
  { key: 'az', label: 'A-Z' },
];

// ══════════════════════════════════════
// HELPERS
// ══════════════════════════════════════
const getImg = (item) => {
  if (!item) return DEFAULT_IMG;

  for (const c of [
    item.picture,
    item.imageUrl,
    item.image,
    item.photoURL,
    item.images?.[0],
  ]) {
    if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:'))) {
      return c;
    }
  }

  return DEFAULT_IMG;
};

const fmtAmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const calcPrice = (item) => {
  let base = 0;
  let disc = 0;

  switch (item?.catalogPriceType) {
    case 'wholesale':
      base = parseFloat(item?.sellingPriceWholesale) || 0;
      disc = parseFloat(item?.wholesaleDiscount) || 0;
      break;
    case 'loose':
      base = parseFloat(item?.sellingPriceLoose) || 0;
      disc = parseFloat(item?.looseDiscount) || 0;
      break;
    default:
      base = parseFloat(item?.sellingPriceRetail) || 0;
      disc = parseFloat(item?.retailDiscount) || 0;
  }

  const discAmt = base * (disc / 100);
  const final = base - discAmt;

  return {
    orig: base,
    discAmt,
    final,
    discPct: disc,
    hasDsc: disc > 0 && discAmt > 0,
  };
};

const isOOS = (item) => parseFloat(item?.stock || 0) <= 0;

const smartSearch = (items, q) => {
  const t = q?.trim();
  if (!t) return items;

  const words = t.toLowerCase().split(/\s+/).filter(Boolean);

  return items.filter((item) => {
    const text = [
      item.name,
      item.sinhalaName,
      item.itemCode,
      item.barcode,
      item.brandName,
      item.categoryName,
      item.description,
      item.modelKeyCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return words.every((w) => text.includes(w));
  });
};

const formatPhoneWA = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('0094')) c = c.slice(2);
  if (c.startsWith('094')) c = c.slice(1);
  if (c.startsWith('0')) c = '94' + c.slice(1);
  if (c.length === 9) c = '94' + c;
  return c;
};

const getShareBase = () =>
  process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app';

const getShareUrl = (shopId, itemId) => {
  const base = getShareBase();
  return `${base}/pfi/${shopId}/item/${itemId}`;
};

const openWhatsAppWithCopiedLink = async (url) => {
  let copied = false;

  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {}

  try {
    window.open('https://wa.me/', '_blank');
  } catch {}

  if (copied) {
    alert('Link copy කළා ✓\n\nWhatsApp chat එකකට paste කළාම preview image එක පෙනේ.');
  } else {
    alert('WhatsApp open විය.\n\nPreview image සඳහා link එක chat එකකට paste කරන්න.');
  }
};

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
const Toast = memo(({ msg, show }) =>
  show ? (
    <div
      style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#10b981',
        color: 'white',
        padding: '11px 22px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        zIndex: 99999,
        boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        maxWidth: '90vw',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {msg}
    </div>
  ) : null
);
Toast.displayName = 'Toast';

// ══════════════════════════════════════
// LOADING
// ══════════════════════════════════════
const Spinner = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      fontFamily: '-apple-system, sans-serif',
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        border: '3px solid #e2e8f0',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: 16,
      }}
    />
    <p style={{ color: '#64748b', fontSize: 14 }}>භාණ්ඩ ලබා ගනිමින්...</p>
    <style>{`
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  </div>
);

// ══════════════════════════════════════
// SHARE MODAL — PRACTICAL VERSION
// ══════════════════════════════════════
const ShareModal = memo(({ item, shopId, shopInfo, onClose }) => {
  if (!item) return null;

  const name = item.sinhalaName || item.name || '';
  const url = getShareUrl(shopId, item.id);
  const p = calcPrice(item);
  const oos = isOOS(item);
  const shop = shopInfo?.shopName || '';
  const unit = item.catalogUom || item.uomName || '';
  const img = getImg(item);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copy කළා ✓\n\nWhatsApp එකේ paste කළාම preview image එක පෙනේ.');
      onClose();
    } catch {
      alert('Copy failed');
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: shop ? `${name} — ${shop}` : name,
        url,
      });
      onClose();
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Share failed:', err);
    }
  };

  const handleWhatsAppPreviewShare = async () => {
    await openWhatsAppWithCopiedLink(url);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          maxWidth: 390,
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            padding: '20px',
            textAlign: 'center',
            color: 'white',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 6 }}>📤</div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Share කරන්න</h3>
          <p style={{ margin: '6px 0 0', fontSize: 11, opacity: 0.85 }}>
            Preview image එක පෙන්වන්න direct item link එක use වෙනවා
          </p>
        </div>

        {/* Product preview */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <img
            src={img}
            alt={name}
            style={{
              width: 56,
              height: 56,
              borderRadius: 10,
              objectFit: 'cover',
              border: '2px solid #e2e8f0',
              flexShrink: 0,
            }}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = DEFAULT_IMG;
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: '#1e293b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>

            {!oos ? (
              <div style={{ marginTop: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#047857' }}>
                  Rs. {fmtAmt(p.hasDsc ? p.final : p.orig)}
                </span>
                {unit && (
                  <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>
                    / {unit}
                  </span>
                )}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: '#3b82f6',
                  fontWeight: 700,
                  marginTop: 3,
                }}
              >
                📞 මිල විමසන්න
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div
          style={{
            margin: '12px 16px 0',
            padding: '10px 14px',
            background: '#f0fdf4',
            borderRadius: 10,
            border: '1px solid #bbf7d0',
            fontSize: 11,
            color: '#166534',
            lineHeight: 1.5,
          }}
        >
          ✅ <b>Best result:</b> Copy Link & Open WhatsApp <br />
          ✅ Chat එකට paste කළාම preview image එක බොහෝවිට පෙනේ
        </div>

        {/* Buttons */}
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Best practical method */}
          <button
            onClick={handleWhatsAppPreviewShare}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px',
              background: 'linear-gradient(135deg,#25d366,#128c7e)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
            }}
          >
            💬 Copy Link & Open WhatsApp
          </button>

          {/* URL only via wa.me */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 15,
              textDecoration: 'none',
              border: '1px solid #86efac',
            }}
          >
            🔗 URL-only WhatsApp Share
          </a>

          {/* Facebook */}
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px',
              background: '#1877f2',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(24,119,242,0.35)',
            }}
          >
            📘 Facebook Share
          </a>

          {/* Copy Link */}
          <button
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
            }}
          >
            🔗 Copy Link
          </button>

          {/* Native Share */}
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              onClick={handleNativeShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '14px',
                background: '#0ea5e9',
                color: 'white',
                borderRadius: 14,
                fontWeight: 800,
                fontSize: 16,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(14,165,233,0.35)',
              }}
            >
              📱 More...
            </button>
          )}
        </div>

        {/* URL preview */}
        <div
          style={{
            margin: '0 16px',
            padding: '8px 12px',
            background: '#f1f5f9',
            borderRadius: 8,
            fontSize: 10,
            color: '#475569',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            border: '1px solid #e2e8f0',
          }}
        >
          {url}
        </div>

        {/* Close */}
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              background: '#f1f5f9',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            වසන්න
          </button>
        </div>
      </div>
    </div>
  );
});
ShareModal.displayName = 'ShareModal';

// ══════════════════════════════════════
// CONTACT MODAL
// ══════════════════════════════════════
const ContactModal = memo(({ item, shopInfo, onClose }) => {
  if (!item) return null;

  const name = item.sinhalaName || item.name || '';
  const phone = shopInfo?.phone || shopInfo?.contactPhone || '';
  const wa = shopInfo?.whatsapp || phone;
  const waNum = formatPhoneWA(wa);
  const waMsg = encodeURIComponent(`"${name}" භාණ්ඩයේ මිල දැනගැනීමට කැමැත්තෙමි 🙏`);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          maxWidth: 360,
          width: '100%',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
            padding: '20px',
            textAlign: 'center',
            color: 'white',
          }}
        >
          <div style={{ fontSize: 36 }}>📞</div>
          <h3 style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 800 }}>
            මිල විමසන්න
          </h3>
        </div>

        <div style={{ padding: '16px' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: '#1e293b',
              marginBottom: 12,
            }}
          >
            {name}
          </div>

          {shopInfo?.shopName && (
            <div
              style={{
                background: '#f0fdf4',
                padding: '8px 12px',
                borderRadius: 10,
                marginBottom: 12,
                fontSize: 13,
                color: '#166534',
                fontWeight: 600,
              }}
            >
              🏪 {shopInfo.shopName}
            </div>
          )}

          {phone ? (
            <>
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#1e40af',
                  letterSpacing: 2,
                  marginBottom: 14,
                  fontFamily: 'monospace',
                }}
              >
                {phone}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={`tel:${phone}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '13px',
                    background: 'linear-gradient(135deg,#16a34a,#15803d)',
                    color: 'white',
                    borderRadius: 13,
                    fontWeight: 800,
                    fontSize: 15,
                    textDecoration: 'none',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
                  }}
                >
                  📞 දැන්ම අමතන්න
                </a>

                {waNum && (
                  <a
                    href={`https://wa.me/${waNum}?text=${waMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '13px',
                      background: 'linear-gradient(135deg,#25d366,#128c7e)',
                      color: 'white',
                      borderRadius: 13,
                      fontWeight: 800,
                      fontSize: 15,
                      textDecoration: 'none',
                      boxShadow: '0 4px 14px rgba(37,211,102,0.3)',
                    }}
                  >
                    💬 WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
              දුරකථන අංකයක් නොමැත
            </div>
          )}
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              background: '#f1f5f9',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            වසන්න
          </button>
        </div>
      </div>
    </div>
  );
});
ContactModal.displayName = 'ContactModal';

// ══════════════════════════════════════
// PRODUCT CARD
// ══════════════════════════════════════
const ProductCard = memo(({ item, shopId, onOpen, onAdd, onShare, onContact }) => {
  const p = useMemo(() => calcPrice(item), [item]);
  const oos = isOOS(item);
  const img = getImg(item);
  const name = item.sinhalaName || item.name || '';
  const unit = item.catalogUom || item.uomName || '';

  const handleAdd = useCallback(
    (e) => {
      e.stopPropagation();
      onAdd(item);
    },
    [item, onAdd]
  );

  const handleShare = useCallback(
    (e) => {
      e.stopPropagation();
      onShare(item);
    },
    [item, onShare]
  );

  const handleContact = useCallback(
    (e) => {
      e.stopPropagation();
      onContact(item);
    },
    [item, onContact]
  );

  const handleQuickWA = useCallback(
    async (e) => {
      e.stopPropagation();
      const url = getShareUrl(shopId, item.id);
      await openWhatsAppWithCopiedLink(url);
    },
    [shopId, item.id]
  );

  return (
    <div
      onClick={() => onOpen(item)}
      style={{
        background: 'white',
        borderRadius: 13,
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
    >
      <div
        style={{
          position: 'relative',
          paddingTop: '100%',
          background: '#f8fafc',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <img
          src={img}
          alt={name}
          loading="lazy"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = DEFAULT_IMG;
          }}
        />

        <button
          onClick={handleShare}
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.92)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
          aria-label="Share"
        >
          📤
        </button>

        <button
          onClick={handleQuickWA}
          style={{
            position: 'absolute',
            top: 5,
            left: 38,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#25d366',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
          }}
          aria-label="WhatsApp Share"
        >
          💬
        </button>

        {!oos && p.hasDsc && (
          <span
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              background: '#dc2626',
              color: 'white',
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 5,
            }}
          >
            -{p.discPct}%
          </span>
        )}

        {item.images?.length > 1 && (
          <span
            style={{
              position: 'absolute',
              bottom: 5,
              right: 5,
              background: 'rgba(15,23,42,0.6)',
              color: 'white',
              fontSize: 9,
              padding: '2px 5px',
              borderRadius: 4,
            }}
          >
            📸{item.images.length}
          </span>
        )}
      </div>

      <div
        style={{
          padding: '9px 10px 11px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: '#1e293b',
            fontSize: 12,
            lineHeight: 1.5,
            marginBottom: 4,
            wordBreak: 'break-word',
          }}
        >
          {name}
        </div>

        {item.sinhalaName && item.name && (
          <div
            style={{
              fontSize: 10,
              color: '#475569',
              marginBottom: 4,
              wordBreak: 'break-word',
            }}
          >
            {item.name}
          </div>
        )}

        {(item.brandName || unit) && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 5,
              flexWrap: 'wrap',
            }}
          >
            {item.brandName && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#6d28d9',
                  background: '#f3f0ff',
                  padding: '2px 5px',
                  borderRadius: 4,
                  border: '1px solid #ede9fe',
                }}
              >
                🏷️ {item.brandName}
              </span>
            )}
            {unit && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#075985',
                  background: '#e0f2fe',
                  padding: '2px 5px',
                  borderRadius: 4,
                  border: '1px solid #bae6fd',
                }}
              >
                📦 {unit}
              </span>
            )}
          </div>
        )}

        <div style={{ flexGrow: 1 }} />

        {!oos ? (
          <>
            {p.hasDsc && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 1,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: '#94a3b8',
                    textDecoration: 'line-through',
                  }}
                >
                  Rs.{fmtAmt(p.orig)}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    color: '#dc2626',
                    background: '#fef2f2',
                    padding: '1px 3px',
                    borderRadius: 3,
                  }}
                >
                  -{p.discPct}%
                </span>
              </div>
            )}

            <div style={{ fontSize: 14, fontWeight: 800, color: '#047857' }}>
              Rs.{fmtAmt(p.hasDsc ? p.final : p.orig)}
            </div>

            {unit && (
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                එකකට {unit}
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleContact}
            style={{
              background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '7px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            📞 මිල විමසන්න
          </button>
        )}

        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <button
            onClick={handleShare}
            style={{
              width: 30,
              flexShrink: 0,
              background: '#eef2ff',
              color: '#3730a3',
              border: '1px solid #c7d2fe',
              borderRadius: 8,
              fontSize: 11,
              cursor: 'pointer',
              padding: '7px 0',
            }}
            aria-label="Share"
          >
            📤
          </button>

          <button
            onClick={handleAdd}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '7px',
            }}
          >
            🛒 කරත්තයට
          </button>
        </div>
      </div>
    </div>
  );
});
ProductCard.displayName = 'ProductCard';

// ══════════════════════════════════════
// ITEM MODAL
// ══════════════════════════════════════
const ItemModal = memo(({ item, shopId, shopInfo, onClose, onAdd, onShare, onContact }) => {
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    setQty(1);
    setImgIdx(0);
  }, [item?.id]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const p = calcPrice(item);
  const oos = isOOS(item);
  const name = item.sinhalaName || item.name || '';
  const engName = item.sinhalaName && item.name ? item.name : '';
  const unit = item.catalogUom || item.uomName || '';
  const imgs = item.images?.length > 0 ? item.images : [getImg(item)];

  const handleQuickWA = async () => {
    const url = getShareUrl(shopId, item.id);
    await openWhatsAppWithCopiedLink(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(15,23,42,0.7)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          width: '100%',
          maxWidth: 500,
          maxHeight: '90vh',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            position: 'relative',
            height: 240,
            background: '#f8fafc',
            flexShrink: 0,
          }}
        >
          <img
            src={imgs[imgIdx] || DEFAULT_IMG}
            alt={name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              padding: 16,
            }}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = DEFAULT_IMG;
            }}
          />

          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.9)',
              border: 'none',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>

          <button
            onClick={() => onShare(item)}
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.95)',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            📤
          </button>

          <button
            onClick={handleQuickWA}
            style={{
              position: 'absolute',
              top: 12,
              left: 56,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#25d366',
              color: 'white',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(37,211,102,0.4)',
            }}
          >
            💬
          </button>

          {!oos && p.hasDsc && (
            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 54,
                background: '#dc2626',
                color: 'white',
                fontSize: 11,
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: 7,
              }}
            >
              -{p.discPct}%
            </span>
          )}

          {imgs.length > 1 && (
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {imgs.map((imgSrc, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    border: imgIdx === i ? '2px solid #3b82f6' : '2px solid white',
                    overflow: 'hidden',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={imgSrc}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = DEFAULT_IMG;
                    }}
                    alt=""
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: '0 0 3px' }}>
            {name}
          </h2>

          {engName && (
            <p style={{ fontSize: 12, color: '#475569', margin: '0 0 10px' }}>
              {engName}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {item.brandName && (
              <span
                style={{
                  fontSize: 10,
                  background: '#f3f0ff',
                  color: '#6d28d9',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 700,
                  border: '1px solid #ede9fe',
                }}
              >
                🏷️ {item.brandName}
              </span>
            )}
            {unit && (
              <span
                style={{
                  fontSize: 10,
                  background: '#e0f2fe',
                  color: '#075985',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 700,
                  border: '1px solid #bae6fd',
                }}
              >
                📦 {unit}
              </span>
            )}
            {item.categoryName && (
              <span
                style={{
                  fontSize: 10,
                  background: '#faf5ff',
                  color: '#7e22ce',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 700,
                }}
              >
                📁 {item.categoryName}
              </span>
            )}
            {item.itemCode && (
              <span
                style={{
                  fontSize: 10,
                  background: '#f1f5f9',
                  color: '#374151',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 700,
                }}
              >
                🔢 {item.itemCode}
              </span>
            )}
          </div>

          {!oos ? (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: 12,
                borderRadius: 14,
                marginBottom: 12,
              }}
            >
              {p.hasDsc ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        textDecoration: 'line-through',
                      }}
                    >
                      Rs. {fmtAmt(p.orig)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        background: '#fef2f2',
                        color: '#dc2626',
                        padding: '1px 7px',
                        borderRadius: 5,
                        fontWeight: 800,
                      }}
                    >
                      -{p.discPct}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 900,
                        color: '#047857',
                      }}
                    >
                      Rs. {fmtAmt(p.final)}
                    </span>
                    {unit && (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#475569',
                          background: 'white',
                          padding: '2px 7px',
                          borderRadius: 5,
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        / {unit}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 7,
                      background: '#fef9c3',
                      color: '#92400e',
                      padding: '5px 9px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-block',
                    }}
                  >
                    💰 ඉතිරිය Rs. {fmtAmt(p.discAmt)}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color: '#047857',
                    }}
                  >
                    Rs. {fmtAmt(p.orig)}
                  </span>
                  {unit && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#475569',
                        background: 'white',
                        padding: '2px 7px',
                        borderRadius: 5,
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      / {unit}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => onContact(item)}
              style={{
                width: '100%',
                padding: 16,
                marginBottom: 12,
                background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
                color: 'white',
                border: 'none',
                borderRadius: 14,
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>📞</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>මිල සඳහා අමතන්න</div>
            </button>
          )}

          {item.description && (
            <div style={{ marginBottom: 12 }}>
              <h4
                style={{
                  fontWeight: 700,
                  color: '#334155',
                  fontSize: 12,
                  margin: '0 0 5px',
                }}
              >
                📝 විස්තරය
              </h4>
              <p
                style={{
                  color: '#475569',
                  fontSize: 12,
                  lineHeight: 1.6,
                  margin: 0,
                  background: '#f8fafc',
                  padding: 10,
                  borderRadius: 10,
                }}
              >
                {item.description}
              </p>
            </div>
          )}

          {!oos && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '10px 14px',
                borderRadius: 14,
              }}
            >
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                ප්‍රමාණය:
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'white',
                  borderRadius: 9,
                  overflow: 'hidden',
                  border: '1px solid #cbd5e1',
                }}
              >
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  style={{
                    width: 38,
                    height: 38,
                    background: 'transparent',
                    border: 'none',
                    fontSize: 18,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  −
                </button>

                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: 48,
                    height: 38,
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 'bold',
                    background: 'white',
                    border: 'none',
                    borderLeft: '1px solid #cbd5e1',
                    borderRight: '1px solid #cbd5e1',
                    outline: 'none',
                  }}
                  min="1"
                />

                <button
                  onClick={() => setQty((q) => q + 1)}
                  style={{
                    width: 38,
                    height: 38,
                    background: 'transparent',
                    border: 'none',
                    fontSize: 18,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 18px',
            borderTop: '1px solid #e2e8f0',
            background: 'white',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleQuickWA}
              style={{
                width: 50,
                flexShrink: 0,
                background: '#25d366',
                color: 'white',
                padding: '13px 0',
                borderRadius: 13,
                fontWeight: 800,
                fontSize: 18,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
              }}
              aria-label="WhatsApp Share"
            >
              💬
            </button>

            <button
              onClick={() => onShare(item)}
              style={{
                width: 50,
                flexShrink: 0,
                background: '#eef2ff',
                color: '#3730a3',
                padding: '13px 0',
                borderRadius: 13,
                fontWeight: 800,
                fontSize: 18,
                border: '1px solid #c7d2fe',
                cursor: 'pointer',
              }}
              aria-label="Share"
            >
              📤
            </button>

            <button
              onClick={() => {
                onAdd(item, qty);
                onClose();
              }}
              style={{
                flex: 1,
                background: oos
                  ? 'linear-gradient(135deg,#64748b,#475569)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
                color: 'white',
                padding: '13px 0',
                borderRadius: 13,
                fontWeight: 800,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🛒 කරත්තයට
              {!oos && ` • Rs.${fmtAmt(p.final * qty)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
ItemModal.displayName = 'ItemModal';

// ══════════════════════════════════════
// CART MODAL
// ══════════════════════════════════════
const CartModal = memo(({ cart, shopId, shopInfo, onUpdate, onRemove, onClear, onClose }) => {
  const [step, setStep] = useState('cart');
  const [name, setName] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('cust_name') : '') || ''
  );
  const [phone, setPhone] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('cust_phone') : '') || ''
  );
  const [address, setAddress] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('cust_address') : '') || ''
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () => cart.reduce((s, c) => s + (isOOS(c.item) ? 0 : c.price * c.qty), 0),
    [cart]
  );

  const handleOrder = async () => {
    if (!name.trim() || !phone.trim()) {
      alert('නම හා දුරකථන අංකය අවශ්‍යයි');
      return;
    }

    setBusy(true);

    localStorage.setItem('cust_name', name.trim());
    localStorage.setItem('cust_phone', phone.trim());
    localStorage.setItem('cust_address', address.trim());

    try {
      const db = getDb();

      const orderData = {
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerAddress: address.trim(),
        orderNote: note.trim(),
        items: cart.map((c) => ({
          id: c.item.id,
          itemCode: c.item.itemCode || '',
          barcode: c.item.barcode || '',
          name: c.item.name || '',
          sinhalaName: c.item.sinhalaName || '',
          itemName: c.item.sinhalaName || c.item.name || '',
          brandName: c.item.brandName || '',
          categoryName: c.item.categoryName || '',
          qty: c.qty,
          quantity: c.qty,
          unitPrice: c.price,
          yourPrice: c.price,
          price: c.price,
          total: c.price * c.qty,
          lineTotal: c.price * c.qty,
          uom: c.item.catalogUom || c.item.uomName || '',
          isOutOfStock: isOOS(c.item),
          outOfStock: isOOS(c.item),
          stock: parseFloat(c.item.stock || 0),
          picture: getImg(c.item),
          photoURL: getImg(c.item),
        })),
        grandTotal: total,
        total,
        shopId,
        uid: shopId,
        status: 'pending',
        source: 'next-catalog',
        itemCount: cart.reduce((s, c) => s + c.qty, 0),
        totalQty: cart.reduce((s, c) => s + c.qty, 0),
        hasOutOfStock: cart.some((c) => isOOS(c.item)),
        createdAt: serverTimestamp(),
        date: new Date().toISOString(),
      };

      await addDoc(collection(db, `shops/${shopId}/pfis`), orderData);

      try {
        await addDoc(collection(db, 'orders'), orderData);
      } catch {}

      onClear();
      setStep('success');
    } catch (err) {
      alert('ඇනවුම යැවීම අසාර්ථකයි: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.7)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {step === 'checkout' && (
              <button
                onClick={() => setStep('cart')}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ←
              </button>
            )}
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              {step === 'cart' && `🛒 කරත්තය (${cart.length})`}
              {step === 'checkout' && '📝 ඇනවුම් විස්තර'}
              {step === 'success' && '✅ ඇනවුම ලැබුණි'}
            </h3>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: 30,
              height: 30,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '40px 10px' }}>
              <div style={{ fontSize: 60, marginBottom: 14 }}>🎉</div>
              <h2 style={{ color: '#059669', fontSize: 20, fontWeight: 900 }}>
                ඇනවුම සාර්ථකයි!
              </h2>
              <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6 }}>
                ඔබේ ඇනවුම ලැබුණි. ඉක්මනින් ඔබව සම්බන්ධ කරගන්නෙමු.
              </p>
              {shopInfo?.shopName && (
                <p style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginTop: 8 }}>
                  🏪 {shopInfo.shopName}
                </p>
              )}
              <button
                onClick={onClose}
                style={{
                  marginTop: 16,
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                  color: 'white',
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: 14,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🛍️ දිගටම බලන්න
              </button>
            </div>
          )}

          {step === 'cart' &&
            (cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🛒</div>
                <div style={{ fontWeight: 700 }}>කරත්තය හිස්ය</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  භාණ්ඩ එකතු කරන්න
                </div>
              </div>
            ) : (
              <>
                {cart.map((c) => (
                  <div
                    key={c.item.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid #f1f5f9',
                      alignItems: 'center',
                    }}
                  >
                    <img
                      src={getImg(c.item)}
                      alt={c.item.sinhalaName || c.item.name}
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 8,
                        objectFit: 'cover',
                        border: '1px solid #e2e8f0',
                        flexShrink: 0,
                      }}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = DEFAULT_IMG;
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: '#1e293b',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.item.sinhalaName || c.item.name}
                      </div>
                      {isOOS(c.item) ? (
                        <div style={{ fontSize: 10, color: '#d97706' }}>📞 මිල විමසන්න</div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                          Rs.{fmtAmt(c.price)}
                          <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>
                            {' '}
                            ×{c.qty}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#f1f5f9',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            onClick={() => onUpdate(c.item.id, c.qty - 1)}
                            style={{
                              width: 26,
                              height: 26,
                              background: 'transparent',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                            }}
                          >
                            −
                          </button>
                          <span style={{ width: 26, textAlign: 'center', fontSize: 12, fontWeight: 'bold' }}>
                            {c.qty}
                          </span>
                          <button
                            onClick={() => onUpdate(c.item.id, c.qty + 1)}
                            style={{
                              width: 26,
                              height: 26,
                              background: 'transparent',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                            }}
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => onRemove(c.item.id)}
                          style={{
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: 5,
                            padding: '3px 7px',
                            fontSize: 10,
                            cursor: 'pointer',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 13,
                        color: '#1e40af',
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {isOOS(c.item) ? '—' : `Rs.${fmtAmt(c.price * c.qty)}`}
                    </div>
                  </div>
                ))}

                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                    borderRadius: 12,
                    border: '1.5px solid #bbf7d0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 18,
                      fontWeight: 900,
                      color: '#16a34a',
                    }}
                  >
                    <span>මුළු එකතුව</span>
                    <span style={{ fontFamily: 'monospace' }}>Rs.{fmtAmt(total)}</span>
                  </div>
                </div>

                {cart.some((c) => isOOS(c.item)) && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 9,
                      padding: '8px 11px',
                      marginTop: 10,
                      fontSize: 11,
                      color: '#92400e',
                    }}
                  >
                    📞 තොග නොමැති භාණ්ඩ සඳහා මිල පසුව දැනුම් දෙනු ලැබේ
                  </div>
                )}
              </>
            ))}

          {step === 'checkout' && (
            <div>
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                    color: '#374151',
                  }}
                >
                  ඔබේ නම <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="කමල් පෙරේරා"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                    color: '#374151',
                  }}
                >
                  දුරකථන <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0771234567"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                    color: '#374151',
                  }}
                >
                  ලිපිනය (Delivery)
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Delivery ලිපිනය"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                    color: '#374151',
                  }}
                >
                  සටහන
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="විශේෂ උපදෙස්..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 12,
                  padding: 12,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    marginBottom: 6,
                    color: '#0f172a',
                  }}
                >
                  📋 ඇනවුම් සාරාංශය
                </div>

                {cart.map((c, idx) => (
                  <div
                    key={c.item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      padding: '3px 0',
                      borderBottom: idx < cart.length - 1 ? '1px dashed #e2e8f0' : 'none',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        color: '#374151',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.item.sinhalaName || c.item.name}
                      <span style={{ color: '#2563eb', fontWeight: 700 }}> ×{c.qty}</span>
                      {isOOS(c.item) && <span style={{ color: '#64748b' }}> (📞)</span>}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        marginLeft: 6,
                        color: isOOS(c.item) ? '#94a3b8' : '#1e293b',
                      }}
                    >
                      {isOOS(c.item) ? '—' : `Rs.${fmtAmt(c.price * c.qty)}`}
                    </span>
                  </div>
                ))}

                <div
                  style={{
                    borderTop: '2px solid #334155',
                    paddingTop: 8,
                    marginTop: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 900,
                    fontSize: 15,
                    color: '#16a34a',
                  }}
                >
                  <span>ගෙවිය යුතු මුදල</span>
                  <span>Rs.{fmtAmt(total)}</span>
                </div>
              </div>

              {cart.some((c) => isOOS(c.item)) && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 9,
                    padding: '8px 11px',
                    marginTop: 10,
                    fontSize: 11,
                    color: '#92400e',
                  }}
                >
                  📞 තොග නොමැති භාණ්ඩ සඳහා මිල පසුව දැනුම් දෙනු ලැබේ
                </div>
              )}
            </div>
          )}
        </div>

        {step === 'cart' && cart.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <button
              onClick={() => setStep('checkout')}
              style={{
                width: '100%',
                padding: '13px',
                background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                color: 'white',
                borderRadius: 13,
                fontWeight: 800,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📝 ඇනවුම් කරන්න • Rs.{fmtAmt(total)}
            </button>
          </div>
        )}

        {step === 'checkout' && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <button
              onClick={handleOrder}
              disabled={busy}
              style={{
                width: '100%',
                padding: '13px',
                background: busy ? '#94a3b8' : 'linear-gradient(135deg,#10b981,#059669)',
                color: 'white',
                borderRadius: 13,
                fontWeight: 800,
                fontSize: 15,
                border: 'none',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? '⏳ යවමින්...' : `✅ ඇනවුම තහවුරු කරන්න • Rs.${fmtAmt(total)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
CartModal.displayName = 'CartModal';

// ══════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════
export default function CatalogClient({
  shopId,
  shopInfo: initialShopInfo,
  initialItems,
  highlightId,
}) {
  const [items, setItems] = useState(initialItems || []);
  const [shopInfo, setShopInfo] = useState(initialShopInfo || {});
  const [loadingData, setLoadingData] = useState(true);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState('');
  const [selBrand, setSelBrand] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [showSort, setShowSort] = useState(false);
  const [selItem, setSelItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [contactItem, setContactItem] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [toast, setToast] = useState({ msg: '', show: false });

  const timerRef = useRef(null);
  const autoOpenRef = useRef('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cart_${shopId}`);
      if (saved) setCart(JSON.parse(saved));
    } catch {
      setCart([]);
    }
  }, [shopId]);

  useEffect(() => {
    localStorage.setItem(`cart_${shopId}`, JSON.stringify(cart));
  }, [cart, shopId]);

  useEffect(() => {
    if (!shopId) return;

    const db = getDb();

    const loadShop = async () => {
      const sources = await Promise.allSettled([
        getDoc(doc(db, 'users', shopId)),
        getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', shopId))),
        getDoc(doc(db, 'generalSettings', shopId)),
        getDoc(doc(db, 'shopDirectory', shopId)),
      ]);

      const merged = {};
      const fields = [
        'shopName',
        'businessName',
        'companyName',
        'phone',
        'contactPhone',
        'mobile',
        'whatsapp',
        'whatsappNumber',
        'address',
      ];

      sources.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        const v = r.value;
        let d = null;

        try {
          if (v && typeof v.exists === 'function') {
            d = v.exists() ? v.data() : null;
          } else if (v && typeof v.empty === 'boolean') {
            d = !v.empty && v.docs && v.docs.length > 0 ? v.docs[0].data() : null;
          }
        } catch {
          d = null;
        }

        if (!d) return;

        fields.forEach((f) => {
          if (!merged[f] && d[f]) merged[f] = d[f];
        });
      });

      setShopInfo({
        shopName: merged.shopName || merged.businessName || merged.companyName || '',
        phone: merged.phone || merged.contactPhone || merged.mobile || '',
        whatsapp: merged.whatsapp || merged.whatsappNumber || '',
        address: merged.address || '',
      });
    };

    loadShop().catch(console.warn);

    const q = query(collection(db, 'items'), where('uid', '==', shopId));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const live = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((i) => !i.isHidden && !i.isPurchaseOnly);

        setItems(live);

        setCart((prev) =>
          prev
            .map((ci) => {
              const fresh = live.find((d) => d.id === ci.item.id);
              if (!fresh) return null;
              const p = calcPrice(fresh);
              return {
                ...ci,
                item: fresh,
                price: p.hasDsc ? p.final : p.orig,
              };
            })
            .filter(Boolean)
        );

        setLoadingData(false);
      },
      (err) => {
        console.error('Firestore:', err.message);
        setLoadingData(false);
      }
    );

    return () => unsub();
  }, [shopId]);

  useEffect(() => {
    if (!highlightId || !items.length) return;
    if (highlightId === 'undefined') return;

    const key = `${shopId}:${highlightId}`;
    if (autoOpenRef.current === key) return;

    const found = items.find((i) => i.id === highlightId);
    if (!found) return;

    autoOpenRef.current = key;
    setSelItem(found);

    setTimeout(() => {
      document.getElementById(`item-${highlightId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 200);
  }, [highlightId, items, shopId]);

  const showToast = useCallback((msg) => {
    setToast({ msg, show: true });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((p) => ({ ...p, show: false }));
    }, 2200);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const addToCart = useCallback(
    (item, qty = 1) => {
      const p = calcPrice(item);
      const price = p.hasDsc ? p.final : p.orig;

      setCart((prev) => {
        const ex = prev.find((c) => c.item.id === item.id);
        if (ex) {
          return prev.map((c) =>
            c.item.id === item.id ? { ...c, qty: c.qty + qty } : c
          );
        }
        return [...prev, { item, qty, price }];
      });

      showToast(`${item.sinhalaName || item.name} කරත්තයට ✓`);
    },
    [showToast]
  );

  const updateQty = useCallback((id, qty) => {
    setCart((prev) =>
      prev.map((c) =>
        c.item.id === id ? { ...c, qty: Math.max(1, qty) } : c
      )
    );
  }, []);

  const removeItem = useCallback((id) => {
    setCart((prev) => prev.filter((c) => c.item.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    localStorage.removeItem(`cart_${shopId}`);
  }, [shopId]);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const cats = useMemo(() => {
    const s = new Set(items.map((i) => i.categoryName).filter(Boolean));
    return [...s].sort();
  }, [items]);

  const liveBrands = useMemo(() => {
    const s = new Set(items.map((i) => i.brandName || i.brand).filter(Boolean));
    return [...s].sort();
  }, [items]);

  const visible = useMemo(() => {
    let f = smartSearch(items, search);

    if (selCat) f = f.filter((i) => i.categoryName === selCat);
    if (selBrand) f = f.filter((i) => (i.brandName || i.brand) === selBrand);

    const sorted = [...f];

    switch (sortBy) {
      case 'priceLow':
        sorted.sort((a, b) => calcPrice(a).final - calcPrice(b).final);
        break;
      case 'priceHigh':
        sorted.sort((a, b) => calcPrice(b).final - calcPrice(a).final);
        break;
      case 'az':
        sorted.sort((a, b) =>
          (a.sinhalaName || a.name || '').localeCompare(
            b.sinhalaName || b.name || ''
          )
        );
        break;
      default:
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return sorted;
  }, [items, search, selCat, selBrand, sortBy]);

  const hasFilters = !!(search || selCat || selBrand || sortBy !== 'default');

  const clearAll = useCallback(() => {
    setSearch('');
    setSelCat('');
    setSelBrand('');
    setSortBy('default');
  }, []);

  if (loadingData && items.length === 0) return <Spinner />;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        background: '#f8fafc',
      }}
    >
      <Toast msg={toast.msg} show={toast.show} />

      {/* Header */}
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 30,
          boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            padding: '12px 14px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            {shopInfo?.shopName && (
              <p
                style={{
                  fontSize: 10,
                  color: '#3b82f6',
                  fontWeight: 700,
                  margin: '0 0 1px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {shopInfo.shopName}
              </p>
            )}
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>
              📦 භාණ්ඩ නාමාවලිය
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {cartCount > 0 && (
              <button
                onClick={() => setShowCart(true)}
                style={{
                  position: 'relative',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  padding: '7px 14px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                🛒
                <span
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '50%',
                    width: 19,
                    height: 19,
                    fontSize: 10,
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid white',
                  }}
                >
                  {cartCount}
                </span>
              </button>
            )}

            <button
              onClick={() => setShowSort(!showSort)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontSize: 15,
                position: 'relative',
                background: showSort || hasFilters ? '#eff6ff' : '#f1f5f9',
                color: showSort || hasFilters ? '#3b82f6' : '#374151',
              }}
            >
              ⚙️
              {hasFilters && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 9,
                    height: 9,
                    background: '#ef4444',
                    borderRadius: '50%',
                    border: '2px solid white',
                  }}
                />
              )}
            </button>
          </div>
        </div>

        <div style={{ padding: '0 14px 8px', position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 25,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 13,
              color: '#94a3b8',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="සොයන්න... (නම, කේතය, Brand)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 34px',
              border: '1px solid #cbd5e1',
              borderRadius: 11,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              background: '#f8fafc',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 22,
                top: '50%',
                transform: 'translateY(-50%)',
                background: '#e2e8f0',
                border: 'none',
                borderRadius: '50%',
                width: 20,
                height: 20,
                cursor: 'pointer',
                fontSize: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {cats.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 5,
              padding: '0 14px 9px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {['', ...cats].map((c) => (
              <button
                key={c || 'all'}
                onClick={() => setSelCat(c)}
                style={{
                  flexShrink: 0,
                  padding: '5px 13px',
                  borderRadius: 18,
                  fontSize: 11,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: selCat === c ? '#3b82f6' : '#f1f5f9',
                  color: selCat === c ? 'white' : '#374151',
                }}
              >
                {c || 'සියල්ල'}
              </button>
            ))}
          </div>
        )}

        {showSort && (
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 7,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    border: sortBy === s.key ? 'none' : '1px solid #cbd5e1',
                    background: sortBy === s.key ? '#3b82f6' : 'white',
                    color: sortBy === s.key ? 'white' : '#374151',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {liveBrands.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: '#374151',
                    fontWeight: 700,
                    alignSelf: 'center',
                  }}
                >
                  Brands:
                </span>
                {['', ...liveBrands].map((b) => (
                  <button
                    key={b || 'allB'}
                    onClick={() => setSelBrand(b)}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      border: selBrand === b ? 'none' : '1px solid #cbd5e1',
                      background: selBrand === b ? '#8b5cf6' : 'white',
                      color: selBrand === b ? 'white' : '#374151',
                    }}
                  >
                    {b || 'සියල්ල'}
                  </button>
                ))}
              </div>
            )}

            {hasFilters && (
              <button
                onClick={clearAll}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: 9,
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕ Clear All
              </button>
            )}
          </div>
        )}

        <div
          style={{
            padding: '3px 14px',
            background: '#f1f5f9',
            fontSize: 10,
            color: '#374151',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            Showing <b>{visible.length}</b> of {items.length}
          </span>
          {search && (
            <span
              style={{
                fontSize: 10,
                color: '#2563eb',
                background: '#dbeafe',
                padding: '2px 7px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              "{search}"
            </span>
          )}
        </div>
      </header>

      <main style={{ padding: 12 }}>
        {visible.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '56px 20px',
              background: 'white',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 10 }}>🔍</div>
            <p
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: '#1e293b',
                marginBottom: 6,
              }}
            >
              {items.length === 0 ? '📦 භාණ්ඩ නොමැත' : 'භාණ්ඩ හමු නොවීය'}
            </p>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
              {items.length === 0
                ? 'මෙම වෙළඳසැලේ භාණ්ඩ ලියාපදිංචි කර නැත'
                : 'වෙනත් වචනයකින් සොයන්න'}
            </p>
            {hasFilters && (
              <button
                onClick={clearAll}
                style={{
                  marginTop: 14,
                  background: '#3b82f6',
                  color: 'white',
                  padding: '9px 18px',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🔄 Clear Search
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            }}
          >
            {visible.map((item) => (
              <div key={item.id} id={`item-${item.id}`}>
                <ProductCard
                  item={item}
                  shopId={shopId}
                  onOpen={setSelItem}
                  onAdd={addToCart}
                  onShare={setShareItem}
                  onContact={setContactItem}
                />
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 80 }} />
      </main>

      {cartCount > 0 && (
        <button
          onClick={() => setShowCart(true)}
          style={{
            position: 'fixed',
            bottom: 22,
            right: 22,
            zIndex: 500,
            width: 58,
            height: 58,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
            border: 'none',
            cursor: 'pointer',
            color: 'white',
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(59,130,246,0.5)',
          }}
          aria-label="Open Cart"
        >
          🛒
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              background: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              fontSize: 10,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid white',
            }}
          >
            {cartCount}
          </span>
        </button>
      )}

      {selItem && (
        <ItemModal
          item={selItem}
          shopId={shopId}
          shopInfo={shopInfo}
          onClose={() => setSelItem(null)}
          onAdd={addToCart}
          onShare={setShareItem}
          onContact={setContactItem}
        />
      )}

      {showCart && (
        <CartModal
          cart={cart}
          shopId={shopId}
          shopInfo={shopInfo}
          onUpdate={updateQty}
          onRemove={removeItem}
          onClear={clearCart}
          onClose={() => setShowCart(false)}
        />
      )}

      {shareItem && (
        <ShareModal
          item={shareItem}
          shopId={shopId}
          shopInfo={shopInfo}
          onClose={() => setShareItem(null)}
        />
      )}

      {contactItem && (
        <ContactModal
          item={contactItem}
          shopInfo={shopInfo}
          onClose={() => setContactItem(null)}
        />
      )}
    </div>
  );
}
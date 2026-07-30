'use client';

// components/CustomerCatalog.jsx
// ✅ Next.js compatible
// ✅ react-router-dom removed
// ✅ public shop slug/id -> owner uid resolve
// ✅ Firestore items loaded by resolved uid
// ✅ Orders saved to actual shop uid
// ✅ Share links still use public shop id/slug

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/shared/firebase-config';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  limit,
} from 'firebase/firestore';

const CATALOG_BASE = (
  process.env.NEXT_PUBLIC_CATALOG_URL ||
  'https://pos-catalog-gold.vercel.app'
).replace(/\/$/, '');

const DEFAULT_IMG =
  'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';
const DEFAULT_SHOP_IMG =
  'https://placehold.co/80x80/dbeafe/3b82f6?text=🏪';

const SORT_OPTIONS = [
  { key: 'default', label: 'පෙරනිමි' },
  { key: 'priceLow', label: 'මිල ↑' },
  { key: 'priceHigh', label: 'මිල ↓' },
  { key: 'az', label: 'නම A-Z' },
];

const TEXT = {
  catalog: 'භාණ්ඩ නාමාවලිය',
  search: 'සොයන්න... (නම, කේතය, Brand)',
  all: 'සියල්ල',
  noResults: 'භාණ්ඩ හමු නොවීය',
  tryAgain: 'වෙනත් වචනයකින් සොයන්න',
  addToCart: 'කරත්තයට',
  contactForPrice: 'මිල සඳහා අමතන්න',
  inquirePrice: 'මිල විමසන්න',
  perUnit: 'එකකට',
  save: 'ඉතිරිය',
  desc: 'විස්තරය',
  loading: 'දත්ත ලබා ගනිමින්...',
  noShop: 'වෙළඳසැල හමු නොවීය',
  found: 'හමුවිය',
  brands: 'Brands',
  qty: 'ප්‍රමාණය',
  cart: 'කරත්තය',
  checkout: 'ඇනවුම් කරන්න',
  emptyCart: 'කරත්තය හිස්ය',
  emptyCartDesc: 'භාණ්ඩ එකතු කරන්න',
  customerName: 'ඔබේ නම',
  customerPhone: 'දුරකථන අංකය',
  customerAddress: 'ලිපිනය (Delivery)',
  orderNote: 'විශේෂ සටහන්',
  placeOrder: 'ඇනවුම තහවුරු කරන්න',
  orderSuccess: 'ඇනවුම සාර්ථකයි!',
  orderSuccessDesc:
    'ඔබේ ඇනවුම ලැබුණි. අපි ඉක්මනින් ඔබව සම්බන්ධ කරගන්නෙමු.',
  continueShopping: 'දිගටම මිලදී ගන්න',
  required: 'අවශ්‍යයි',
  submitting: 'යවමින්...',
  addedToCart: 'කරත්තයට එකතු කළා ✓',
  orderSummary: 'ඇනවුම් සාරාංශය',
  grossTotal: 'මුළු මිල',
  discount: 'වට්ටම්',
  grandTotal: 'ගෙවිය යුතු මුදල',
  back: 'ආපසු',
  yourInfo: 'ඔබේ තොරතුරු',
  orderPlaced: 'ඇනවුම ලැබුණි',
  oosCartNote:
    '📞 තොග නොමැති භාණ්ඩ සඳහා මිල ඇනවුමෙන් පසු දැනුම් දෙනු ලැබේ.',
  clearAll: '✕ Clear All Filters',
  clearSearch: '🔄 Clear Search',
  showing: 'Showing',
  of: 'of',
  checkoutTitle: 'ඇනවුම් විස්තර',
  callNow: 'දැන්ම අමතන්න',
  whatsappNow: 'WhatsApp',
  shopPhone: 'දුරකථන අංකය',
  noPhoneAvailable: 'දුරකථන අංකයක් ලබා දී නැත',
  closeModal: 'වසන්න',
  priceInquiry: 'මිල විමසීම',
  priceInquiryDesc: 'මෙම භාණ්ඩයේ මිල දැනගැනීමට වෙළඳසැල අමතන්න',
  share: 'Share',
  shareWhatsApp: 'WhatsApp Share',
  shareCopy: 'Link Copy',
  shareCopied: 'Link copy කළා ✓',
  shareFailed: 'Share කිරීම අසාර්ථක විය',
  shareItem: 'මෙම භාණ්ඩය Share කරන්න',
  selectShop: 'වෙළඳසැල තෝරන්න',
  changeShop: 'වෙළඳසැල මාරු කරන්න',
  searchShop: 'වෙළඳසැල සොයන්න...',
  noShopsFound: 'වෙළඳසැල් හමු නොවීය',
  loadingShops: 'වෙළඳසැල් ලබා ගනිමින්...',
  shopItems: 'භාණ්ඩ',
  currentShop: 'දැනට තෝරාගත්',
  allShops: 'සියලුම වෙළඳසැල්',
  selectShopDesc: 'ඇනවුම් කිරීමට වෙළඳසැලක් තෝරන්න',
  shopSelected: 'වෙළඳසැල තෝරාගත්තා ✓',
  viewCatalog: 'නාමාවලිය බලන්න',
  noItemsRegistered: 'මෙම වෙළඳසැලේ භාණ්ඩ ලියාපදිංචි කර නැත',
};

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */
const getImg = (item) => {
  if (!item) return DEFAULT_IMG;
  for (const c of [
    item.picture,
    item.imageUrl,
    item.image,
    item.photoURL,
    item.images?.[0],
  ]) {
    if (
      typeof c === 'string' &&
      (c.startsWith('http') || c.startsWith('data:image'))
    )
      return c;
  }
  return DEFAULT_IMG;
};

const getShopImg = (shop) => {
  if (!shop) return DEFAULT_SHOP_IMG;
  for (const c of [
    shop.logo,
    shop.logoUrl,
    shop.shopLogo,
    shop.image,
    shop.photoURL,
    shop.picture,
  ]) {
    if (
      typeof c === 'string' &&
      (c.startsWith('http') || c.startsWith('data:image'))
    )
      return c;
  }
  return DEFAULT_SHOP_IMG;
};

const fmtAmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPrice = (n) => `Rs. ${fmtAmt(n)}`;

const calcPrice = (item) => {
  let base = 0;
  let disc = 0;
  let label = 'retail';

  switch (item.catalogPriceType) {
    case 'wholesale':
      base = parseFloat(item.sellingPriceWholesale) || 0;
      disc = parseFloat(item.wholesaleDiscount) || 0;
      label = 'wholesale';
      break;
    case 'loose':
      base = parseFloat(item.sellingPriceLoose) || 0;
      disc = parseFloat(item.looseDiscount) || 0;
      label = 'loose';
      break;
    default:
      base = parseFloat(item.sellingPriceRetail) || 0;
      disc = parseFloat(item.retailDiscount) || 0;
  }

  const discAmt = base * (disc / 100);
  const final = base - discAmt;

  let factor = 1;
  if (
    item.catalogUom &&
    item.catalogUom !== item.uomName &&
    item.availableUnits?.length
  ) {
    const c = item.availableUnits.find(
      (u) => u.toUnitName === item.catalogUom
    );
    if (c && parseFloat(c.factor) > 0) factor = parseFloat(c.factor);
  }

  return {
    orig: base / factor,
    discAmt: discAmt / factor,
    final: final / factor,
    discPct: disc,
    label,
    unit: item.catalogUom || item.uomName || '',
    hasDsc: disc > 0 && discAmt > 0,
  };
};

const getDisplayUnit = (item) =>
  item.catalogUom || item.displayUnit || item.uomName || item.unit || '';

const getBrandName = (item) => item.brandName || item.brand || '';

const isOutOfStock = (item) => parseFloat(item?.stock || 0) <= 0;

const smartSearch = (items, q) => {
  const trimmed = q?.trim();
  if (!trimmed) return items;
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;

  return items.filter((item) => {
    const text = [
      item.name,
      item.sinhalaName,
      item.itemCode,
      item.barcode,
      item.modelKeyCode,
      item.brandName,
      item.categoryName,
      item.subCategoryName,
      item.description,
      item.colorName,
      item.uomName,
      item.supplierName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return words.every((w) => text.includes(w));
  });
};

const truncateText = (text, max = 120) => {
  const s = String(text || '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

const getShareUrl = (shopId, itemId) =>
  `${CATALOG_BASE}/pfi/${shopId}/item/${itemId}`;

const getSharePayload = (item, shopId, shopInfo) => {
  const price = calcPrice(item);
  const oos = isOutOfStock(item);
  const name = item.sinhalaName || item.name || 'Product';
  const shopName = shopInfo?.shopName || '';
  const itemUrl = getShareUrl(shopId, item.id);

  let priceText = oos ? TEXT.contactForPrice : fmtPrice(price.final);
  if (!oos && price.unit) priceText += ` (${TEXT.perUnit} ${price.unit})`;

  const whatsappText = itemUrl;
  const richText = [
    `🛍️ *${name}*`,
    `💰 ${priceText}`,
    shopName ? `🏪 ${shopName}` : null,
    '',
    `👇 ${itemUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: shopName ? `${name} - ${shopName}` : name,
    text: richText,
    url: itemUrl,
    whatsappText,
    richText,
  };
};

const formatPhoneForCall = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/[\s\-\(\)]/g, '');
  if (c.startsWith('0094')) c = '+' + c.substring(2);
  if (c.startsWith('094')) c = '+' + c.substring(1);
  if (c.startsWith('94') && !c.startsWith('+94')) c = '+' + c;
  if (c.startsWith('0')) c = '+94' + c.substring(1);
  if (!c.startsWith('+')) c = '+94' + c;
  return c;
};

const formatPhoneForWhatsApp = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('0094')) c = c.substring(2);
  if (c.startsWith('094')) c = c.substring(1);
  if (c.startsWith('0')) c = '94' + c.substring(1);
  if (c.length === 9) c = '94' + c;
  return c;
};

/* ═══════════════════════════════════════
   PUBLIC SHOP ID -> UID RESOLVER
   ═══════════════════════════════════════ */
const resolvePublicShopToUid = async (rawShopId) => {
  if (!rawShopId) return '';

  // 1. rawShopId itself might already be uid
  try {
    const userSnap = await getDoc(doc(db, 'users', rawShopId));
    if (userSnap.exists()) return rawShopId;
  } catch {}

  // 2. shopDirectory doc id might be public id
  try {
    const dirSnap = await getDoc(doc(db, 'shopDirectory', rawShopId));
    if (dirSnap.exists()) {
      const d = dirSnap.data();
      return (
        d.uid ||
        d.userId ||
        d.ownerUid ||
        d.ownerId ||
        d.shopUid ||
        rawShopId
      );
    }
  } catch {}

  // 3. Search common slug fields in shopDirectory
  for (const field of ['shopSlug', 'slug', 'publicId', 'catalogSlug']) {
    try {
      const snap = await getDocs(
        query(collection(db, 'shopDirectory'), where(field, '==', rawShopId), limit(1))
      );
      if (!snap.empty) {
        const d = snap.docs[0].data();
        return (
          d.uid ||
          d.userId ||
          d.ownerUid ||
          d.ownerId ||
          d.shopUid ||
          snap.docs[0].id
        );
      }
    } catch {}
  }

  // 4. Search common slug fields in users
  for (const field of ['shopSlug', 'slug', 'publicId', 'catalogSlug']) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where(field, '==', rawShopId), limit(1))
      );
      if (!snap.empty) return snap.docs[0].id;
    } catch {}
  }

  return rawShopId;
};

/* ═══════════════════════════════════════
   GLOBAL STYLES
   ═══════════════════════════════════════ */
const GlobalStyles = memo(({ embedded }) => (
  <style>{`
    #customer-catalog-root * { box-sizing: border-box; }
    @keyframes ccToastIn { from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
    @keyframes ccSlideUp { from{transform:translateY(100%)}to{transform:translateY(0)} }
    @keyframes ccFadeIn { from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)} }
    @keyframes ccSpin { to{transform:rotate(360deg)} }
    @keyframes ccPulse { 0%{box-shadow:0 0 0 0 rgba(59,130,246,.6)}70%{box-shadow:0 0 0 10px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)} }
    @keyframes ccShopPulse { 0%{box-shadow:0 0 0 0 rgba(139,92,246,.5)}70%{box-shadow:0 0 0 8px rgba(139,92,246,0)}100%{box-shadow:0 0 0 0 rgba(139,92,246,0)} }
    @keyframes ccPhoneRing { 0%,100%{transform:rotate(0)}10%{transform:rotate(14deg)}20%{transform:rotate(-14deg)}30%{transform:rotate(10deg)}40%{transform:rotate(-10deg)}50%{transform:rotate(6deg)}60%{transform:rotate(-6deg)}70%{transform:rotate(0)} }
    #customer-catalog-root {
      ${embedded
        ? "position:relative;width:100%;min-height:calc(100vh - 100px);display:flex;overflow:hidden;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-radius:12px;border:1px solid #e2e8f0;"
        : "position:fixed;inset:0;z-index:200;display:flex;overflow:hidden;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
      }
    }
    .cc-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
    .cc-main-body{flex:1;overflow-y:auto}
    .cc-main-body::-webkit-scrollbar{width:6px}.cc-main-body::-webkit-scrollbar-track{background:#f1f5f9}.cc-main-body::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
    .cc-cart-sidebar{width:340px;min-width:340px;max-width:340px;background:white;border-left:1px solid #e2e8f0;display:flex;flex-direction:column;overflow:hidden}
    .cc-cart-body{flex:1;overflow-y:auto}.cc-cart-body::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:3px}
    .cc-grid{display:grid;padding:12px;gap:12px;grid-template-columns:repeat(2,1fr)}
    @media(min-width:480px){.cc-grid{grid-template-columns:repeat(3,1fr)}}
    @media(min-width:900px){.cc-grid{grid-template-columns:repeat(3,1fr);gap:14px;padding:14px}}
    @media(min-width:1100px){.cc-grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:899px){.cc-cart-sidebar{display:none!important}.cc-desktop-only{display:none!important}}
    @media(min-width:900px){.cc-mobile-only{display:none!important}}
    .cc-card{transition:transform .15s,box-shadow .15s;cursor:pointer}
    .cc-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.10)!important}
    .cc-contact-btn,.cc-share-btn{transition:transform .15s,box-shadow .15s}
    .cc-contact-btn:hover,.cc-share-btn:hover{transform:scale(1.03);box-shadow:0 4px 16px rgba(37,99,235,.3)!important}
    .cc-contact-btn:active,.cc-share-btn:active{transform:scale(.97)}
    .cc-shop-card{transition:all .2s ease;cursor:pointer}
    .cc-shop-card:hover{transform:translateY(-3px);box-shadow:0 8px 28px rgba(0,0,0,.12)!important}
    .cc-shop-card:active{transform:scale(.98)}
    input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
    input[type=number]{-moz-appearance:textfield}
  `}</style>
));
GlobalStyles.displayName = 'GlobalStyles';

/* ═══════════════════════════════════════
   TOAST
   ═══════════════════════════════════════ */
const Toast = memo(({ message, show }) => {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
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
        animation: 'ccToastIn .3s ease-out',
        whiteSpace: 'nowrap',
        maxWidth: '80vw',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {message}
    </div>
  );
});
Toast.displayName = 'Toast';

/* ═══════════════════════════════════════
   SHOP SELECTOR MODAL
   ═══════════════════════════════════════ */
const ShopSelectorModal = memo(({ currentShopId, onSelectShop, onClose }) => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 300);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadShops = async () => {
      try {
        const [dirSnap, usersSnap, itemsSnap] = await Promise.all([
          getDocs(collection(db, 'shopDirectory')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'items')),
        ]);

        if (cancelled) return;

        const itemCountMap = {};
        itemsSnap.docs.forEach((d) => {
          const uid = d.data()?.uid;
          if (uid) itemCountMap[uid] = (itemCountMap[uid] || 0) + 1;
        });

        const uidsWithItems = new Set(Object.keys(itemCountMap));
        const merged = new Map();

        dirSnap.docs.forEach((d) => {
          const s = { id: d.id, ...d.data() };
          const name =
            s.shopName || s.businessName || s.companyName || s.name || '';
          merged.set(s.id, {
            id: s.id,
            name,
            address: s.address || s.location || '',
            phone: s.phone || s.contactPhone || s.mobile || '',
            logo: getShopImg(s),
            category: s.category || s.shopCategory || s.type || '',
            itemCount: 0,
          });
        });

        usersSnap.docs.forEach((d) => {
          const s = d.data();
          const uid = d.id;

          const shopName = s.shopName || s.businessName || s.companyName || '';
          const displayName = s.displayName || '';
          const email = s.email || '';

          let name = '';
          if (shopName) name = shopName;
          else if (displayName) name = displayName;
          else if (email) name = email.split('@')[0];

          if (!name && !uidsWithItems.has(uid)) return;
          if (!name) name = `Shop ${uid.substring(0, 8)}...`;

          if (!merged.has(uid)) {
            merged.set(uid, {
              id: uid,
              name,
              address: s.address || '',
              phone: s.phone || s.contactPhone || s.mobile || '',
              logo: getShopImg(s),
              category: s.category || s.shopCategory || '',
              itemCount: 0,
            });
          } else {
            const existing = merged.get(uid);
            if (!existing.name && name) existing.name = name;
          }
        });

        uidsWithItems.forEach((uid) => {
          if (!merged.has(uid)) {
            merged.set(uid, {
              id: uid,
              name: `Shop ${uid.substring(0, 8)}...`,
              address: '',
              phone: '',
              logo: DEFAULT_SHOP_IMG,
              category: '',
              itemCount: 0,
            });
          }
        });

        merged.forEach((shop, id) => {
          shop.itemCount = itemCountMap[id] || 0;
        });

        const allShops = [...merged.values()]
          .filter((s) => s.name)
          .sort((a, b) => {
            const aHas = a.itemCount > 0 ? 1 : 0;
            const bHas = b.itemCount > 0 ? 1 : 0;
            if (bHas !== aHas) return bHas - aHas;
            if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
            return a.name.localeCompare(b.name);
          });

        setShops(allShops);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('loadShops error:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    };

    loadShops();
    return () => { cancelled = true; };
  }, []);

  const filteredShops = useMemo(() => {
    if (!search.trim()) return shops;
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return shops.filter((shop) => {
      const text = [shop.name, shop.address, shop.category, shop.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [shops, search]);

  const totalItems = useMemo(
    () => shops.reduce((sum, s) => sum + s.itemCount, 0),
    [shops]
  );

  const shopsWithItems = useMemo(
    () => shops.filter((s) => s.itemCount > 0).length,
    [shops]
  );

  const handleSelect = useCallback((shop) => {
    onSelectShop(shop.id, shop);
    onClose();
  }, [onSelectShop, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.75)',
          backdropFilter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          background: 'white',
          borderRadius: 22,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ccFadeIn .25s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 10,
            background: 'rgba(255,255,255,0.92)',
            color: '#1e293b',
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: 'none',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        <div
          style={{
            background: 'linear-gradient(135deg,#7c3aed,#3b82f6)',
            padding: '28px 22px 20px',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 8 }}>🏪</div>
          <h2
            style={{
              color: 'white',
              fontSize: 20,
              fontWeight: 900,
              margin: '0 0 4px',
            }}
          >
            {TEXT.selectShop}
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 12,
              margin: 0,
            }}
          >
            {TEXT.selectShopDesc}
          </p>

          {!loading && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 12,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: 10,
                  padding: '6px 14px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: 'white',
                  }}
                >
                  {shops.length}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.8)',
                    fontWeight: 600,
                  }}
                >
                  වෙළඳසැල්
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: 10,
                  padding: '6px 14px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: 'white',
                  }}
                >
                  {shopsWithItems}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.8)',
                    fontWeight: 600,
                  }}
                >
                  භාණ්ඩ ඇති
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: 10,
                  padding: '6px 14px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: 'white',
                  }}
                >
                  {totalItems.toLocaleString()}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.8)',
                    fontWeight: 600,
                  }}
                >
                  මුළු භාණ්ඩ
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 18px 10px',
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
            background: '#f8fafc',
          }}
        >
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 12,
                color: '#94a3b8',
                fontSize: 14,
                pointerEvents: 'none',
              }}
            >
              🔍
            </span>
            <input
              ref={searchRef}
              type="text"
              placeholder={TEXT.searchShop}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 36px 11px 38px',
                border: '2px solid #e2e8f0',
                borderRadius: 12,
                fontSize: 14,
                color: '#1e293b',
                background: 'white',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#7c3aed')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  searchRef.current?.focus();
                }}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '50%',
                  width: 22,
                  height: 22,
                  cursor: 'pointer',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#374151',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {!loading && (
            <div
              style={{
                fontSize: 11,
                color: '#64748b',
                marginTop: 8,
                fontWeight: 600,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {TEXT.showing} <b>{filteredShops.length}</b> {TEXT.of}{' '}
                {shops.length} {TEXT.allShops}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: '#7c3aed',
                  background: '#f3f0ff',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 700,
                }}
              >
                📦 වැඩිම භාණ්ඩ ඉහළින්
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 18px 18px',
            minHeight: 200,
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 10px' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: '3px solid #e2e8f0',
                  borderTopColor: '#7c3aed',
                  borderRadius: '50%',
                  animation: 'ccSpin 1s linear infinite',
                  margin: '0 auto 14px',
                }}
              />
              <p
                style={{
                  color: '#475569',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {TEXT.loadingShops}
              </p>
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 10px',
                background: '#fef2f2',
                borderRadius: 14,
                border: '1px solid #fecaca',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
              <p
                style={{
                  fontSize: 13,
                  color: '#991b1b',
                  fontWeight: 600,
                }}
              >
                {error}
              </p>
            </div>
          )}

          {!loading && !error && filteredShops.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 10px' }}>
              <div style={{ fontSize: 44, marginBottom: 10, opacity: 0.4 }}>
                🔍
              </div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#1e293b',
                }}
              >
                {TEXT.noShopsFound}
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    marginTop: 10,
                    background: '#7c3aed',
                    color: 'white',
                    padding: '9px 20px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {TEXT.clearSearch}
                </button>
              )}
            </div>
          )}

          {!loading &&
            !error &&
            filteredShops.map((shop, index) => {
              const isCurrent = shop.id === currentShopId;
              const hasItems = shop.itemCount > 0;

              return (
                <div
                  key={shop.id}
                  className="cc-shop-card"
                  onClick={() => handleSelect(shop)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    marginBottom: 10,
                    background: isCurrent
                      ? 'linear-gradient(135deg,#ede9fe,#dbeafe)'
                      : hasItems
                      ? 'white'
                      : '#fafafa',
                    borderRadius: 16,
                    border: isCurrent
                      ? '2px solid #7c3aed'
                      : hasItems
                      ? '1px solid #e2e8f0'
                      : '1px solid #f1f5f9',
                    boxShadow: isCurrent
                      ? '0 4px 16px rgba(124,58,237,0.15)'
                      : '0 1px 4px rgba(0,0,0,0.04)',
                    opacity: hasItems ? 1 : 0.6,
                    position: 'relative',
                    ...(isCurrent ? { animation: 'ccShopPulse 2s infinite' } : {}),
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelect(shop)}
                >
                  {index < 3 && hasItems && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -5,
                        left: -5,
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background:
                          index === 0
                            ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                            : index === 1
                            ? 'linear-gradient(135deg,#94a3b8,#64748b)'
                            : 'linear-gradient(135deg,#d97706,#92400e)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        border: '2px solid white',
                        zIndex: 1,
                      }}
                    >
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </div>
                  )}

                  <img
                    src={shop.logo}
                    alt={shop.name}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      objectFit: 'cover',
                      flexShrink: 0,
                      border: isCurrent
                        ? '2px solid #7c3aed'
                        : '2px solid #e2e8f0',
                      background: '#f8fafc',
                    }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = DEFAULT_SHOP_IMG;
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 15,
                        color: '#1e293b',
                        wordBreak: 'break-word',
                        lineHeight: 1.4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {shop.name}
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: 8,
                            background: '#7c3aed',
                            color: 'white',
                            padding: '2px 7px',
                            borderRadius: 99,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {TEXT.currentShop}
                        </span>
                      )}
                    </div>

                    {shop.address && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#64748b',
                          marginTop: 3,
                          lineHeight: 1.4,
                        }}
                      >
                        📍 {truncateText(shop.address, 60)}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 5,
                        marginTop: 6,
                      }}
                    >
                      {shop.category && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#6d28d9',
                            background: '#f3f0ff',
                            padding: '2px 7px',
                            borderRadius: 6,
                          }}
                        >
                          🏷️ {shop.category}
                        </span>
                      )}
                      {shop.phone && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#075985',
                            background: '#e0f2fe',
                            padding: '2px 7px',
                            borderRadius: 6,
                          }}
                        >
                          📞 {shop.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 48,
                        padding: '6px 10px',
                        borderRadius: 12,
                        background: hasItems
                          ? shop.itemCount >= 100
                            ? 'linear-gradient(135deg,#059669,#10b981)'
                            : shop.itemCount >= 10
                            ? 'linear-gradient(135deg,#2563eb,#3b82f6)'
                            : 'linear-gradient(135deg,#7c3aed,#8b5cf6)'
                          : '#f1f5f9',
                        color: hasItems ? 'white' : '#94a3b8',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          lineHeight: 1.2,
                        }}
                      >
                        {shop.itemCount.toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          opacity: hasItems ? 0.9 : 0.6,
                          marginTop: 1,
                        }}
                      >
                        {TEXT.shopItems}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        background: isCurrent ? '#7c3aed' : 'transparent',
                        color: isCurrent ? 'white' : '#94a3b8',
                      }}
                    >
                      {isCurrent ? '✓' : '→'}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <div
          style={{
            padding: '12px 18px 16px',
            borderTop: '1px solid #e2e8f0',
            flexShrink: 0,
            background: '#f8fafc',
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 0',
              background: '#f1f5f9',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {TEXT.closeModal}
          </button>
        </div>
      </div>
    </div>
  );
});
ShopSelectorModal.displayName = 'ShopSelectorModal';

/* ═══════════════════════════════════════
   SHARE MODAL
   ═══════════════════════════════════════ */
const ShareModal = memo(({ item, shopId, shopInfo, onClose, onToast }) => {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const name = item.sinhalaName || item.name || '';
  const img = getImg(item);
  const p = calcPrice(item);
  const oos = isOutOfStock(item);
  const displayUnit = getDisplayUnit(item);
  const payload = getSharePayload(item, shopId, shopInfo);

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(payload.whatsappText)}`, '_blank');
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = payload.url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onToast(TEXT.shareCopied);
      onClose();
    } catch {
      onToast(TEXT.shareFailed);
    }
  };

  const handleFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(payload.url)}`,
      '_blank',
      'width=600,height=400'
    );
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.72)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          background: 'white',
          borderRadius: 22,
          overflow: 'hidden',
          animation: 'ccSlideUp .28s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            background: 'rgba(255,255,255,0.92)',
            color: '#1e293b',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            fontSize: 13,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        <div
          style={{
            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            padding: '24px 20px 18px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 6 }}>📤</div>
          <h3
            style={{
              color: 'white',
              fontSize: 18,
              fontWeight: 800,
              margin: '0 0 4px',
            }}
          >
            {TEXT.shareItem}
          </h3>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <img
            src={img}
            alt={name}
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
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
                fontSize: 14,
                color: '#1e293b',
                wordBreak: 'break-word',
                lineHeight: 1.4,
              }}
            >
              {name}
            </div>
            {!oos ? (
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: '#047857',
                  }}
                >
                  Rs. {fmtAmt(p.final)}
                </span>
                {displayUnit && (
                  <span
                    style={{
                      fontSize: 10,
                      color: '#64748b',
                      marginLeft: 4,
                    }}
                  >
                    {TEXT.perUnit} {displayUnit}
                  </span>
                )}
                {p.hasDsc && (
                  <span
                    style={{
                      fontSize: 10,
                      color: '#dc2626',
                      marginLeft: 6,
                      fontWeight: 700,
                    }}
                  >
                    -{p.discPct}%
                  </span>
                )}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: '#3b82f6',
                  fontWeight: 700,
                  marginTop: 4,
                }}
              >
                📞 {TEXT.contactForPrice}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <button
            onClick={handleWhatsApp}
            className="cc-share-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '14px 0',
              background: 'linear-gradient(135deg,#25d366,#128c7e)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            💬 {TEXT.shareWhatsApp}
          </button>

          <button
            onClick={handleFacebook}
            className="cc-share-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '14px 0',
              background: '#1877f2',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            📘 Facebook
          </button>

          <button
            onClick={handleCopyLink}
            className="cc-share-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '14px 0',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🔗 {TEXT.shareCopy}
          </button>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              onClick={async () => {
                try {
                  await navigator.share({
                    title: payload.title,
                    url: payload.url,
                  });
                  onClose();
                } catch (err) {
                  if (err?.name !== 'AbortError') onToast(TEXT.shareFailed);
                }
              }}
              className="cc-share-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                padding: '14px 0',
                background: '#0ea5e9',
                color: 'white',
                borderRadius: 14,
                fontWeight: 800,
                fontSize: 16,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📱 {TEXT.share}
            </button>
          )}
        </div>

        <div style={{ padding: '0 20px 18px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 0',
              background: '#f1f5f9',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {TEXT.closeModal}
          </button>
        </div>
      </div>
    </div>
  );
});
ShareModal.displayName = 'ShareModal';

/* ═══════════════════════════════════════
   CONTACT PHONE MODAL
   ═══════════════════════════════════════ */
const ContactPhoneModal = memo(({ item, shopInfo, onClose }) => {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const name = item.sinhalaName || item.name || '';
  const img = getImg(item);
  const shopPhone = shopInfo?.phone || '';
  const waPhone = shopInfo?.whatsapp || shopPhone;
  const shopName = shopInfo?.shopName || '';
  const shopAddress = shopInfo?.address || '';
  const callLink = formatPhoneForCall(shopPhone);
  const waLink = formatPhoneForWhatsApp(waPhone);
  const waMessage = encodeURIComponent(
    `සුබ දවසක් 🙏\n\n"${name}" භාණ්ඩයේ මිල දැනගැනීමට කැමැත්තෙමි.\n\nස්තූතියි!`
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.72)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          background: 'white',
          borderRadius: 22,
          overflow: 'hidden',
          animation: 'ccSlideUp .28s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            background: 'rgba(255,255,255,0.92)',
            color: '#1e293b',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            fontSize: 13,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        <div
          style={{
            background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
            padding: '28px 20px 20px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 42,
              marginBottom: 8,
              animation: 'ccPhoneRing 1.5s ease-in-out infinite',
              display: 'inline-block',
            }}
          >
            📞
          </div>
          <h3
            style={{
              color: 'white',
              fontSize: 18,
              fontWeight: 800,
              margin: '0 0 4px',
            }}
          >
            {TEXT.priceInquiry}
          </h3>
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 12,
              margin: 0,
            }}
          >
            {TEXT.priceInquiryDesc}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <img
            src={img}
            alt={name}
            style={{
              width: 50,
              height: 50,
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
                fontSize: 14,
                color: '#1e293b',
                wordBreak: 'break-word',
                lineHeight: 1.4,
              }}
            >
              {name}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {shopName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                padding: '10px 14px',
                background: '#f0fdf4',
                borderRadius: 12,
                border: '1px solid #bbf7d0',
              }}
            >
              <span style={{ fontSize: 20 }}>🏪</span>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: '#166534',
                  }}
                >
                  {shopName}
                </div>
                {shopAddress && (
                  <div
                    style={{
                      fontSize: 10,
                      color: '#64748b',
                      marginTop: 2,
                    }}
                  >
                    📍 {shopAddress}
                  </div>
                )}
              </div>
            </div>
          )}

          {shopPhone ? (
            <>
              <div
                style={{
                  background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
                  borderRadius: 14,
                  padding: 16,
                  textAlign: 'center',
                  marginBottom: 14,
                  border: '2px solid #93c5fd',
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#1e40af',
                    letterSpacing: '1.5px',
                    fontFamily: 'monospace',
                  }}
                >
                  {shopPhone}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a
                  href={`tel:${callLink}`}
                  className="cc-contact-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '14px 0',
                    background: 'linear-gradient(135deg,#16a34a,#15803d)',
                    color: 'white',
                    borderRadius: 14,
                    fontWeight: 800,
                    fontSize: 16,
                    textDecoration: 'none',
                  }}
                >
                  📞 {TEXT.callNow}
                </a>

                {waLink && (
                  <a
                    href={`https://wa.me/${waLink}?text=${waMessage}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cc-contact-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '14px 0',
                      background: 'linear-gradient(135deg,#25d366,#128c7e)',
                      color: 'white',
                      borderRadius: 14,
                      fontWeight: 800,
                      fontSize: 16,
                      textDecoration: 'none',
                    }}
                  >
                    💬 {TEXT.whatsappNow}
                  </a>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 10px',
                background: '#fef2f2',
                borderRadius: 14,
                border: '1px solid #fecaca',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>😔</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#991b1b',
                }}
              >
                {TEXT.noPhoneAvailable}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '0 20px 18px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 0',
              background: '#f1f5f9',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {TEXT.closeModal}
          </button>
        </div>
      </div>
    </div>
  );
});
ContactPhoneModal.displayName = 'ContactPhoneModal';

/* ═══════════════════════════════════════
   DETAIL MODAL
   ═══════════════════════════════════════ */
const DetailModal = memo(({ item, onClose, onAddToCart, onContactClick, onShareClick, shopId }) => {
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setImgIdx(0);
    setQty(1);
  }, [item?.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const p = calcPrice(item);
  const oos = isOutOfStock(item);
  const displayUnit = getDisplayUnit(item);
  const brand = getBrandName(item);
  const name = item.sinhalaName || item.name || '';
  const englishName = item.sinhalaName && item.name ? item.name : '';
  const imgs = item.images?.length > 0 ? item.images : [getImg(item)];

  const handleQuickWA = (e) => {
    e.stopPropagation();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(getShareUrl(shopId, item.id))}`,
      '_blank'
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.72)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          background: 'white',
          borderRadius: 20,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ccSlideUp .28s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            background: 'rgba(255,255,255,0.92)',
            color: '#1e293b',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            fontSize: 13,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 240,
            background: '#f8fafc',
            flexShrink: 0,
          }}
        >
          <img
            src={imgs[imgIdx] || DEFAULT_IMG}
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
            alt={name}
          />
          <button
            onClick={(e) => { e.stopPropagation(); onShareClick(item); }}
            className="cc-share-btn"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.95)',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            📤
          </button>
          <button
            onClick={handleQuickWA}
            className="cc-share-btn"
            style={{
              position: 'absolute',
              top: 12,
              left: 56,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: '#25d366',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            💬
          </button>

          {!oos && p.hasDsc && (
            <span
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                background: '#dc2626',
                color: 'white',
                fontSize: 11,
                fontWeight: 'bold',
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
              {imgs.map((im, i) => (
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
                    src={im}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
          <h2
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: '#0f172a',
              margin: '0 0 3px',
            }}
          >
            {name}
          </h2>

          {englishName && (
            <p
              style={{
                fontSize: 12,
                color: '#475569',
                margin: '0 0 10px',
              }}
            >
              {englishName}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 5,
              marginBottom: 12,
            }}
          >
            {brand && (
              <span
                style={{
                  fontSize: 10,
                  background: '#f3f0ff',
                  color: '#6d28d9',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 700,
                }}
              >
                🏷️ {brand}
              </span>
            )}
            {displayUnit && (
              <span
                style={{
                  fontSize: 10,
                  background: '#e0f2fe',
                  color: '#075985',
                  padding: '3px 9px',
                  borderRadius: 99,
                  fontWeight: 700,
                }}
              >
                📦 {displayUnit}
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      marginBottom: 3,
                    }}
                  >
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

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 900,
                        color: '#047857',
                      }}
                    >
                      Rs. {fmtAmt(p.final)}
                    </span>
                    {displayUnit && (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#475569',
                        }}
                      >
                        / {displayUnit}
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
                    💰 {TEXT.save} Rs. {fmtAmt(p.discAmt)}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color: '#047857',
                    }}
                  >
                    Rs. {fmtAmt(p.orig)}
                  </span>
                  {displayUnit && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#475569',
                      }}
                    >
                      / {displayUnit}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContactClick(item);
              }}
              className="cc-contact-btn"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
                border: 'none',
                padding: 16,
                borderRadius: 14,
                textAlign: 'center',
                marginBottom: 12,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 5 }}>📞</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>
                {TEXT.contactForPrice}
              </div>
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
                📝 {TEXT.desc}
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
            <span
              style={{
                fontSize: 13,
                color: '#374151',
                fontWeight: 600,
              }}
            >
              {TEXT.qty}:
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
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                −
              </button>
              <input
                type="number"
                value={qty}
                onChange={(e) =>
                  setQty(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
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
                  color: '#0f172a',
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
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>
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
              className="cc-share-btn"
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
              }}
            >
              💬
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShareClick(item);
              }}
              className="cc-share-btn"
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
            >
              📤
            </button>
            <button
              onClick={() => {
                onAddToCart(item, qty);
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
              🛒 {TEXT.addToCart}
              {!oos && ` • Rs. ${fmtAmt(p.final * qty)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
DetailModal.displayName = 'DetailModal';

/* ═══════════════════════════════════════
   CARD
   ═══════════════════════════════════════ */
const Card = memo(({ item, onClick, onAddToCart, onContactClick, onShareClick, shopId }) => {
  const p = useMemo(() => calcPrice(item), [item]);
  const oos = isOutOfStock(item);
  const displayUnit = getDisplayUnit(item);
  const brand = getBrandName(item);
  const sinhalaName = item.sinhalaName || '';
  const englishName = item.name || '';
  const img = getImg(item);
  const imgCount = item.images?.length || (item.picture ? 1 : 0);

  const handleQuickWA = useCallback((e) => {
    e.stopPropagation();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(getShareUrl(shopId, item.id))}`,
      '_blank'
    );
  }, [shopId, item.id]);

  const handleShare = useCallback((e) => {
    e.stopPropagation();
    onShareClick(item);
  }, [item, onShareClick]);

  const handleContact = useCallback((e) => {
    e.stopPropagation();
    onContactClick(item);
  }, [item, onContactClick]);

  const handleAdd = useCallback((e) => {
    e.stopPropagation();
    onAddToCart(item, 1);
  }, [item, onAddToCart]);

  return (
    <div
      className="cc-card"
      style={{
        background: 'white',
        borderRadius: 13,
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
      onClick={() => onClick(item)}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingTop: '100%',
          background: '#f8fafc',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <img
          src={img}
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
          alt={sinhalaName || englishName}
          loading="lazy"
        />

        <button
          onClick={handleShare}
          className="cc-share-btn"
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.92)',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          📤
        </button>

        <button
          onClick={handleQuickWA}
          className="cc-share-btn"
          style={{
            position: 'absolute',
            top: 5,
            left: 38,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: '#25d366',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
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

        {imgCount > 1 && (
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
            📸{imgCount}
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
        {sinhalaName && (
          <h3
            style={{
              fontWeight: 700,
              color: '#1e293b',
              fontSize: 12,
              lineHeight: 1.5,
              margin: '0 0 2px',
              wordBreak: 'break-word',
            }}
          >
            {sinhalaName}
          </h3>
        )}

        {englishName && (
          <div
            style={{
              fontSize: 10,
              color: '#475569',
              marginBottom: 4,
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            {englishName}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            marginBottom: 5,
          }}
        >
          {brand && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: '#6d28d9',
                background: '#f3f0ff',
                padding: '2px 5px',
                borderRadius: 4,
              }}
            >
              🏷️{brand}
            </span>
          )}
          {displayUnit && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: '#075985',
                background: '#e0f2fe',
                padding: '2px 5px',
                borderRadius: 4,
              }}
            >
              📦{displayUnit}
            </span>
          )}
        </div>

        <div style={{ flexGrow: 1 }} />

        {!oos ? (
          <>
            {p.hasDsc && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
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

            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: '#047857',
              }}
            >
              Rs.{fmtAmt(p.hasDsc ? p.final : p.orig)}
            </span>

            {displayUnit && (
              <div
                style={{
                  fontSize: 9,
                  color: '#64748b',
                  marginTop: 1,
                }}
              >
                {TEXT.perUnit} {displayUnit}
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleContact}
            className="cc-contact-btn"
            style={{
              background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 7px',
              textAlign: 'center',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'white',
              }}
            >
              📞 {TEXT.contactForPrice}
            </div>
          </button>
        )}

        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <button
            onClick={handleQuickWA}
            className="cc-share-btn"
            style={{
              width: 32,
              flexShrink: 0,
              background: '#25d366',
              color: 'white',
              border: 'none',
              padding: '8px 0',
              borderRadius: 9,
              fontWeight: 'bold',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            💬
          </button>

          <button
            onClick={handleShare}
            className="cc-share-btn"
            style={{
              width: 32,
              flexShrink: 0,
              background: '#eef2ff',
              color: '#3730a3',
              border: '1px solid #c7d2fe',
              padding: '8px 0',
              borderRadius: 9,
              fontWeight: 'bold',
              fontSize: 12,
              cursor: 'pointer',
            }}
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
              padding: '8px 0',
              borderRadius: 9,
              fontWeight: 'bold',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            🛒 {TEXT.addToCart}
          </button>
        </div>
      </div>
    </div>
  );
});
Card.displayName = 'Card';

/* ═══════════════════════════════════════
   CART ITEM ROW
   ═══════════════════════════════════════ */
const CartItemRow = memo(({ cartItem, isLast, onUpdateQty, onRemove }) => {
  const { item, qty, priceInfo } = cartItem;
  const name = item.sinhalaName || item.name || '';
  const img = getImg(item);
  const oos = isOutOfStock(item);
  const price = oos ? 0 : priceInfo.final;

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 0',
        borderBottom: !isLast ? '1px solid #f1f5f9' : 'none',
      }}
    >
      <img
        src={img}
        style={{
          width: 52,
          height: 52,
          borderRadius: 8,
          objectFit: 'cover',
          border: '1px solid #e2e8f0',
          flexShrink: 0,
        }}
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = DEFAULT_IMG;
        }}
        alt={name}
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
          {name}
        </div>
        {oos ? (
          <div
            style={{
              fontSize: 10,
              color: '#475569',
              marginTop: 2,
              fontWeight: 600,
            }}
          >
            📞 {TEXT.contactForPrice}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: '#059669',
              marginTop: 2,
            }}
          >
            {fmtPrice(price)}
            <span
              style={{
                fontSize: 9,
                color: '#64748b',
                fontWeight: 400,
              }}
            >
              {' '}×{qty}
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 5,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f1f5f9',
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid #cbd5e1',
            }}
          >
            <button
              onClick={() => onUpdateQty(item.id, Math.max(1, qty - 1))}
              style={{
                width: 25,
                height: 25,
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                fontWeight: 'bold',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              −
            </button>
            <span
              style={{
                width: 25,
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 'bold',
                color: '#0f172a',
              }}
            >
              {qty}
            </span>
            <button
              onClick={() => onUpdateQty(item.id, qty + 1)}
              style={{
                width: 25,
                height: 25,
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                fontWeight: 'bold',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>

          <button
            onClick={() => onRemove(item.id)}
            style={{
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              borderRadius: 5,
              padding: '3px 6px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {oos ? (
          <div
            style={{
              fontSize: 11,
              color: '#475569',
              fontWeight: 700,
            }}
          >
            —
          </div>
        ) : (
          <>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                color: '#1e40af',
              }}
            >
              {fmtPrice(price * qty)}
            </div>
            {priceInfo.hasDsc && (
              <div
                style={{
                  fontSize: 9,
                  color: '#ef4444',
                }}
              >
                -{fmtPrice(priceInfo.discAmt * qty)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
CartItemRow.displayName = 'CartItemRow';

/* ═══════════════════════════════════════
   CHECKOUT FORM
   ═══════════════════════════════════════ */
const CheckoutForm = memo(({
  cart,
  grossTotal,
  totalDiscount,
  grandTotal,
  hasOOS,
  shopUid,
  publicShopId,
  shopInfo,
  onSuccess,
  onBack,
}) => {
  const [customerName, setCustomerName] = useState(() => {
    try { return localStorage.getItem('cust_name') || ''; } catch { return ''; }
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try { return localStorage.getItem('cust_phone') || ''; } catch { return ''; }
  });
  const [customerAddress, setCustomerAddress] = useState(() => {
    try { return localStorage.getItem('cust_address') || ''; } catch { return ''; }
  });
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = useCallback(() => {
    const e = {};
    if (!customerName.trim()) e.name = true;
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 9) e.phone = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [customerName, customerPhone]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    if (!shopUid) {
      alert('Shop UID not resolved.');
      return;
    }

    setSubmitting(true);

    try {
      localStorage.setItem('cust_name', customerName.trim());
      localStorage.setItem('cust_phone', customerPhone.trim());
      localStorage.setItem('cust_address', customerAddress.trim());
    } catch {}

    try {
      const standardizedItems = cart.map((c) => {
        const itemOOS = isOutOfStock(c.item);
        const yourPrice = itemOOS ? 0 : c.priceInfo.final;
        const discAmount = itemOOS ? 0 : c.priceInfo.discAmt;
        return {
          id: c.item.id || '',
          name: c.item.name || '',
          sinhalaName: c.item.sinhalaName || '',
          itemName: c.item.sinhalaName || c.item.name || '',
          brandName: c.item.brandName || '',
          categoryName: c.item.categoryName || '',
          qty: c.qty,
          quantity: c.qty,
          unitPrice: itemOOS ? 0 : c.priceInfo.orig,
          yourPrice,
          price: yourPrice,
          total: yourPrice * c.qty,
          lineTotal: yourPrice * c.qty,
          discount: discAmount * c.qty,
          discAmount,
          discPercent: itemOOS ? 0 : c.priceInfo.discPct,
          uom: c.priceInfo.unit || c.item.uomName || '',
          priceType: c.priceInfo.label,
          isOutOfStock: itemOOS,
          stock: parseFloat(c.item.stock || 0),
          picture: getImg(c.item),
        };
      });

      const orderData = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        orderNote: orderNote.trim(),
        items: standardizedItems,
        grossTotal,
        totalDiscount,
        grandTotal,
        total: grandTotal,
        status: 'pending',
        hasOutOfStock: hasOOS,

        // actual owner uid
        shopId: shopUid,
        uid: shopUid,

        // public route id
        publicShopId: publicShopId || shopUid,

        createdAt: serverTimestamp(),
        date: new Date().toISOString(),
        source: 'customer-catalog',
        itemCount: cart.reduce((s, c) => s + c.qty, 0),
        totalQty: cart.reduce((s, c) => s + c.qty, 0),
      };

      await addDoc(collection(db, `shops/${shopUid}/pfis`), orderData);
      try { await addDoc(collection(db, 'orders'), orderData); } catch {}

      onSuccess();
    } catch (err) {
      alert(`ඇනවුම යැවීම අසාර්ථක විය.\n\n${err.message || ''}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    customerName,
    customerPhone,
    customerAddress,
    orderNote,
    cart,
    grossTotal,
    totalDiscount,
    grandTotal,
    hasOOS,
    shopUid,
    publicShopId,
    onSuccess,
  ]);

  const inp = (err) => ({
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: err ? '2px solid #ef4444' : '1px solid #cbd5e1',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    background: err ? '#fef2f2' : 'white',
    color: '#1e293b',
  });

  return (
    <div>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'none',
            border: 'none',
            color: '#3b82f6',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            marginBottom: 14,
            padding: 0,
          }}
        >
          ← {TEXT.back}
        </button>
      )}

      <h4
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: '#0f172a',
          margin: '0 0 12px',
        }}
      >
        👤 {TEXT.yourInfo}
      </h4>

      <div style={{ marginBottom: 10 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#374151',
            display: 'block',
            marginBottom: 3,
          }}
        >
          {TEXT.customerName} *
        </label>
        <input
          type="text"
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
            setErrors((p) => ({ ...p, name: false }));
          }}
          placeholder="උදා: කමල් පෙරේරා"
          style={inp(errors.name)}
        />
        {errors.name && (
          <span style={{ fontSize: 10, color: '#ef4444' }}>
            {TEXT.required}
          </span>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#374151',
            display: 'block',
            marginBottom: 3,
          }}
        >
          {TEXT.customerPhone} *
        </label>
        <input
          type="tel"
          value={customerPhone}
          onChange={(e) => {
            setCustomerPhone(e.target.value);
            setErrors((p) => ({ ...p, phone: false }));
          }}
          placeholder="0771234567"
          style={inp(errors.phone)}
        />
        {errors.phone && (
          <span style={{ fontSize: 10, color: '#ef4444' }}>
            {TEXT.required}
          </span>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#374151',
            display: 'block',
            marginBottom: 3,
          }}
        >
          {TEXT.customerAddress}
        </label>
        <textarea
          value={customerAddress}
          onChange={(e) => setCustomerAddress(e.target.value)}
          placeholder="Delivery ලිපිනය"
          rows={2}
          style={{
            ...inp(false),
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#374151',
            display: 'block',
            marginBottom: 3,
          }}
        >
          {TEXT.orderNote}
        </label>
        <textarea
          value={orderNote}
          onChange={(e) => setOrderNote(e.target.value)}
          placeholder="විශේෂ උපදෙස්..."
          rows={2}
          style={{
            ...inp(false),
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
      </div>

      <div
        style={{
          background: '#f8fafc',
          borderRadius: 11,
          padding: 11,
          border: '1px solid #e2e8f0',
          marginBottom: 12,
        }}
      >
        <h4
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 7px',
          }}
        >
          📋 {TEXT.orderSummary}
        </h4>

        {cart.map((c, idx) => {
          const itemOOS = isOutOfStock(c.item);
          const price = itemOOS ? 0 : c.priceInfo.final;
          return (
            <div
              key={c.item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                padding: '3px 0',
                borderBottom:
                  idx !== cart.length - 1 ? '1px dashed #e2e8f0' : 'none',
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
                <span style={{ color: '#2563eb', fontWeight: 700 }}>
                  {' '}×{c.qty}
                </span>
                {itemOOS && <span style={{ color: '#64748b' }}> (📞)</span>}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: itemOOS ? '#94a3b8' : '#1e293b',
                  marginLeft: 6,
                }}
              >
                {itemOOS ? '—' : fmtAmt(price * c.qty)}
              </span>
            </div>
          );
        })}

        {totalDiscount > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#dc2626',
              marginTop: 6,
            }}
          >
            <span>🏷️ {TEXT.discount}</span>
            <span>-{fmtPrice(totalDiscount)}</span>
          </div>
        )}

        <div
          style={{
            borderTop: '2px solid #334155',
            marginTop: 7,
            paddingTop: 7,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            fontWeight: 900,
            color: '#16a34a',
          }}
        >
          <span>{TEXT.grandTotal}</span>
          <span>Rs. {fmtAmt(grandTotal)}</span>
        </div>
      </div>

      {hasOOS && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 9,
            padding: '9px 11px',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: '#92400e',
              fontWeight: 600,
            }}
          >
            {TEXT.oosCartNote}
          </span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '13px 0',
          background: submitting
            ? '#94a3b8'
            : 'linear-gradient(135deg,#10b981,#059669)',
          color: 'white',
          borderRadius: 12,
          fontWeight: 800,
          fontSize: 14,
          border: 'none',
          cursor: submitting ? 'wait' : 'pointer',
        }}
      >
        {submitting
          ? `⏳ ${TEXT.submitting}`
          : `✅ ${TEXT.placeOrder} • Rs. ${fmtAmt(grandTotal)}`}
      </button>
    </div>
  );
});
CheckoutForm.displayName = 'CheckoutForm';

/* ═══════════════════════════════════════
   DESKTOP CART SIDEBAR
   ═══════════════════════════════════════ */
const DesktopCartSidebar = memo(({
  cart,
  onUpdateQty,
  onRemove,
  onClearCart,
  shopUid,
  publicShopId,
  shopInfo,
}) => {
  const [view, setView] = useState('cart');

  const totals = useMemo(() => {
    let gross = 0;
    let disc = 0;
    let grand = 0;
    let count = 0;
    let oos = false;

    cart.forEach((c) => {
      gross += c.priceInfo.orig * c.qty;
      disc += c.priceInfo.discAmt * c.qty;
      const isOOS = isOutOfStock(c.item);
      if (isOOS) oos = true;
      grand += (isOOS ? 0 : c.priceInfo.final) * c.qty;
      count += c.qty;
    });

    return {
      grossTotal: gross,
      totalDiscount: disc,
      grandTotal: grand,
      totalItems: count,
      hasOOS: oos,
    };
  }, [cart]);

  const handleSuccess = useCallback(() => {
    onClearCart();
    setView('success');
  }, [onClearCart]);

  useEffect(() => {
    if (cart.length === 0 && view === 'checkout') setView('cart');
  }, [cart.length, view]);

  return (
    <aside className="cc-cart-sidebar">
      <div
        style={{
          padding: '16px 18px',
          borderBottom: '1px solid #e2e8f0',
          flexShrink: 0,
          background: view === 'success' ? '#ecfdf5' : '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {view === 'checkout' && (
            <button
              onClick={() => setView('cart')}
              style={{
                background: '#f1f5f9',
                border: 'none',
                width: 28,
                height: 28,
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
                color: '#374151',
              }}
            >
              ←
            </button>
          )}

          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 800,
              color: '#0f172a',
              flex: 1,
            }}
          >
            {view === 'cart' && '🛒 ' + TEXT.cart}
            {view === 'checkout' && '📝 ' + TEXT.checkoutTitle}
            {view === 'success' && '✅ ' + TEXT.orderPlaced}
          </h2>

          {view === 'cart' && totals.totalItems > 0 && (
            <span
              style={{
                background: '#3b82f6',
                color: 'white',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 800,
                padding: '2px 9px',
              }}
            >
              {totals.totalItems}
            </span>
          )}
        </div>
      </div>

      <div className="cc-cart-body" style={{ padding: '0 18px' }}>
        {view === 'success' && (
          <div style={{ textAlign: 'center', padding: '36px 10px' }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🎉</div>
            <h3
              style={{
                fontSize: 19,
                fontWeight: 900,
                color: '#059669',
                margin: '0 0 8px',
              }}
            >
              {TEXT.orderSuccess}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: '#475569',
                lineHeight: 1.6,
              }}
            >
              {TEXT.orderSuccessDesc}
            </p>
            <button
              onClick={() => setView('cart')}
              style={{
                marginTop: 18,
                width: '100%',
                padding: '12px 0',
                background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                color: 'white',
                borderRadius: 11,
                fontWeight: 800,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🛍️ {TEXT.continueShopping}
            </button>
          </div>
        )}

        {view === 'cart' &&
          (cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 10px' }}>
              <div style={{ fontSize: 44, marginBottom: 10, opacity: 0.35 }}>🛒</div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#64748b',
                  margin: 0,
                }}
              >
                {TEXT.emptyCart}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: '#94a3b8',
                  margin: '4px 0 0',
                }}
              >
                {TEXT.emptyCartDesc}
              </p>
            </div>
          ) : (
            <div style={{ paddingTop: 8, paddingBottom: 8 }}>
              {cart.map((c, idx) => (
                <CartItemRow
                  key={c.item.id}
                  cartItem={c}
                  isLast={idx === cart.length - 1}
                  onUpdateQty={onUpdateQty}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ))}

        {view === 'checkout' && (
          <div style={{ paddingTop: 14, paddingBottom: 14 }}>
            <CheckoutForm
              cart={cart}
              grossTotal={totals.grossTotal}
              totalDiscount={totals.totalDiscount}
              grandTotal={totals.grandTotal}
              hasOOS={totals.hasOOS}
              shopUid={shopUid}
              publicShopId={publicShopId}
              shopInfo={shopInfo}
              onSuccess={handleSuccess}
              onBack={() => setView('cart')}
            />
          </div>
        )}
      </div>

      {view === 'cart' && cart.length > 0 && (
        <div
          style={{
            padding: '14px 18px',
            borderTop: '1px solid #e2e8f0',
            background: 'white',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              background: '#f8fafc',
              borderRadius: 11,
              padding: 11,
              marginBottom: 11,
              border: '1px solid #e2e8f0',
            }}
          >
            {totals.totalDiscount > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#475569',
                    marginBottom: 3,
                  }}
                >
                  <span>{TEXT.grossTotal}</span>
                  <span>{fmtPrice(totals.grossTotal)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: '#dc2626',
                    marginBottom: 3,
                  }}
                >
                  <span>🏷️ {TEXT.discount}</span>
                  <span>-{fmtPrice(totals.totalDiscount)}</span>
                </div>
              </>
            )}

            <div
              style={{
                borderTop: '2px solid #334155',
                paddingTop: 7,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 17,
                fontWeight: 900,
                color: '#16a34a',
              }}
            >
              <span>{TEXT.grandTotal}</span>
              <span>{fmtPrice(totals.grandTotal)}</span>
            </div>
          </div>

          {totals.hasOOS && (
            <div
              style={{
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: 8,
                padding: '7px 10px',
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: '#92400e',
                  fontWeight: 600,
                }}
              >
                {TEXT.oosCartNote}
              </span>
            </div>
          )}

          <button
            onClick={() => setView('checkout')}
            style={{
              width: '100%',
              padding: '12px 0',
              background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
              color: 'white',
              borderRadius: 11,
              fontWeight: 800,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            📝 {TEXT.checkout} • Rs.{fmtAmt(totals.grandTotal)}
          </button>
        </div>
      )}
    </aside>
  );
});
DesktopCartSidebar.displayName = 'DesktopCartSidebar';

/* ═══════════════════════════════════════
   MOBILE CART MODAL
   ═══════════════════════════════════════ */
const MobileCartModal = memo(({
  cart,
  onClose,
  onUpdateQty,
  onRemove,
  onClearCart,
  shopUid,
  publicShopId,
  shopInfo,
}) => {
  const [step, setStep] = useState('cart');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const totals = useMemo(() => {
    let gross = 0;
    let disc = 0;
    let grand = 0;
    let count = 0;
    let oos = false;

    cart.forEach((c) => {
      gross += c.priceInfo.orig * c.qty;
      disc += c.priceInfo.discAmt * c.qty;
      const isOOS = isOutOfStock(c.item);
      if (isOOS) oos = true;
      grand += (isOOS ? 0 : c.priceInfo.final) * c.qty;
      count += c.qty;
    });

    return {
      grossTotal: gross,
      totalDiscount: disc,
      grandTotal: grand,
      totalItems: count,
      hasOOS: oos,
    };
  }, [cart]);

  const handleSuccess = useCallback(() => {
    onClearCart();
    setStep('success');
  }, [onClearCart]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.7)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          background: 'white',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ccSlideUp .28s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '15px 18px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            background: step === 'success' ? '#ecfdf5' : 'white',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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
                  color: '#374151',
                }}
              >
                ←
              </button>
            )}
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              {step === 'cart' && `🛒 ${TEXT.cart} (${totals.totalItems})`}
              {step === 'checkout' && `📝 ${TEXT.checkoutTitle}`}
              {step === 'success' && `✅ ${TEXT.orderPlaced}`}
            </h3>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              width: 30,
              height: 30,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#374151',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '28px 10px' }}>
              <div style={{ fontSize: 56, marginBottom: 14 }}>🎉</div>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: '#059669',
                  margin: '0 0 8px',
                }}
              >
                {TEXT.orderSuccess}
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: '#475569',
                  lineHeight: 1.6,
                  margin: '0 0 14px',
                }}
              >
                {TEXT.orderSuccessDesc}
              </p>
              <button
                onClick={onClose}
                style={{
                  marginTop: 14,
                  width: '100%',
                  padding: '13px 0',
                  background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                  color: 'white',
                  borderRadius: 13,
                  fontWeight: 800,
                  fontSize: 14,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🛍️ {TEXT.continueShopping}
              </button>
            </div>
          )}

          {step === 'cart' &&
            (cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 10px' }}>
                <div style={{ fontSize: 46, marginBottom: 10 }}>🛒</div>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: '#1e293b',
                    margin: '0 0 5px',
                  }}
                >
                  {TEXT.emptyCart}
                </h3>
                <p style={{ fontSize: 12, color: '#475569' }}>
                  {TEXT.emptyCartDesc}
                </p>
              </div>
            ) : (
              <>
                {cart.map((c, idx) => (
                  <CartItemRow
                    key={c.item.id}
                    cartItem={c}
                    isLast={idx === cart.length - 1}
                    onUpdateQty={onUpdateQty}
                    onRemove={onRemove}
                  />
                ))}

                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: 11,
                    padding: 11,
                    marginTop: 14,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {totals.totalDiscount > 0 && (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          color: '#475569',
                          marginBottom: 3,
                        }}
                      >
                        <span>{TEXT.grossTotal}</span>
                        <span>{fmtPrice(totals.grossTotal)}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: '#dc2626',
                          marginBottom: 3,
                        }}
                      >
                        <span>🏷️ {TEXT.discount}</span>
                        <span>-{fmtPrice(totals.totalDiscount)}</span>
                      </div>
                    </>
                  )}

                  <div
                    style={{
                      borderTop: '2px solid #334155',
                      paddingTop: 7,
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 17,
                      fontWeight: 900,
                      color: '#16a34a',
                    }}
                  >
                    <span>{TEXT.grandTotal}</span>
                    <span>{fmtPrice(totals.grandTotal)}</span>
                  </div>
                </div>

                {totals.hasOOS && (
                  <div
                    style={{
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      borderRadius: 9,
                      padding: '8px 11px',
                      marginTop: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: '#92400e',
                        fontWeight: 600,
                      }}
                    >
                      {TEXT.oosCartNote}
                    </span>
                  </div>
                )}
              </>
            ))}

          {step === 'checkout' && (
            <CheckoutForm
              cart={cart}
              grossTotal={totals.grossTotal}
              totalDiscount={totals.totalDiscount}
              grandTotal={totals.grandTotal}
              hasOOS={totals.hasOOS}
              shopUid={shopUid}
              publicShopId={publicShopId}
              shopInfo={shopInfo}
              onSuccess={handleSuccess}
            />
          )}
        </div>

        {step === 'cart' && cart.length > 0 && (
          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setStep('checkout')}
              style={{
                width: '100%',
                padding: '13px 0',
                background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                color: 'white',
                borderRadius: 13,
                fontWeight: 800,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📝 {TEXT.checkout} • Rs.{fmtAmt(totals.grandTotal)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
MobileCartModal.displayName = 'MobileCartModal';

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function CustomerCatalog({ shopId: propShopId }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const embedded = !!propShopId;

  // public route shop id / slug
  const initialShopId = propShopId || params?.shopId || '';
  const [activeShopId, setActiveShopId] = useState(initialShopId);

  const publicShopId = activeShopId;
  const [resolvedShopUid, setResolvedShopUid] = useState('');
  const [shopResolved, setShopResolved] = useState(false);

  const prevExternalShopIdRef = useRef(initialShopId);

  useEffect(() => {
    const newId = propShopId || params?.shopId || '';
    if (newId !== prevExternalShopIdRef.current) {
      prevExternalShopIdRef.current = newId;
      setActiveShopId(newId || '');
    }
  }, [propShopId, params?.shopId]);

  const highlightId = searchParams?.get('highlight') || '';

  const [items, setItems] = useState([]);
  const [shopInfo, setShopInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState('');
  const [selBrand, setSelBrand] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [selItem, setSelItem] = useState(null);
  const [showSort, setShowSort] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [cart, setCart] = useState([]);
  const [contactItem, setContactItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [showShopSelector, setShowShopSelector] = useState(false);

  const searchRef = useRef(null);
  const toastTimerRef = useRef(null);
  const autoOpenedRef = useRef('');
  const unsubRef = useRef(null);

  const showToastMessage = useCallback((message) => {
    setToastMsg(message);
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setShowToast(false), 2200);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // Resolve public shop slug/id -> actual uid
  useEffect(() => {
    let cancelled = false;

    if (!publicShopId) {
      setResolvedShopUid('');
      setShopResolved(true);
      setLoading(false);
      return;
    }

    setShopResolved(false);
    setLoading(true);

    resolvePublicShopToUid(publicShopId)
      .then((uid) => {
        if (!cancelled) {
          setResolvedShopUid(uid || '');
          setShopResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedShopUid('');
          setShopResolved(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [publicShopId]);

  // Load cart by public shop id (route-based cart)
  useEffect(() => {
    if (!publicShopId) return;
    try {
      const s = localStorage.getItem(`cart_${publicShopId}`);
      setCart(s ? JSON.parse(s) : []);
    } catch {
      setCart([]);
    }
  }, [publicShopId]);

  // Save cart by public shop id
  useEffect(() => {
    if (publicShopId) {
      try {
        localStorage.setItem(`cart_${publicShopId}`, JSON.stringify(cart));
      } catch {}
    }
  }, [cart, publicShopId]);

  // Load items + shop info using resolved uid
  useEffect(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    if (!publicShopId) {
      setLoading(false);
      setItems([]);
      setShopInfo(null);
      return;
    }

    if (!shopResolved) return;

    if (!resolvedShopUid) {
      setItems([]);
      setShopInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setItems([]);
    setShopInfo(null);

    const q = query(collection(db, 'items'), where('uid', '==', resolvedShopUid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(data);

        setCart((prev) =>
          prev
            .map((ci) => {
              const fresh = data.find((d) => d.id === ci.item.id);
              if (!fresh) return null;
              return { ...ci, item: fresh, priceInfo: calcPrice(fresh) };
            })
            .filter(Boolean)
        );

        setLoading(false);
      },
      (err) => {
        console.error('items snapshot error:', err);
        if (!cancelled) setLoading(false);
      }
    );

    unsubRef.current = unsub;

    const loadShop = async () => {
      try {
        const sources = await Promise.allSettled([
          getDoc(doc(db, 'users', resolvedShopUid)),
          getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', resolvedShopUid), limit(1))),
          getDoc(doc(db, 'generalSettings', resolvedShopUid)),
          getDoc(doc(db, 'shopDirectory', publicShopId)),
          getDoc(doc(db, 'shopDirectory', resolvedShopUid)),
        ]);

        if (cancelled) return;

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
          'email',
        ];

        sources.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const val = result.value;
          let data = null;

          if (typeof val.exists === 'function' || typeof val.exists === 'boolean') {
            const exists = typeof val.exists === 'function' ? val.exists() : val.exists;
            data = exists ? val.data() : null;
          } else if (val.empty !== undefined) {
            data = val.empty ? null : val.docs[0]?.data();
          }

          if (!data) return;
          fields.forEach((f) => {
            if (!merged[f] && data[f]) merged[f] = data[f];
          });
        });

        if (!cancelled) {
          setShopInfo({
            shopName:
              merged.shopName ||
              merged.businessName ||
              merged.companyName ||
              '',
            phone:
              merged.phone ||
              merged.contactPhone ||
              merged.mobile ||
              '',
            whatsapp:
              merged.whatsapp ||
              merged.whatsappNumber ||
              '',
            address: merged.address || '',
            email: merged.email || '',
          });
        }
      } catch (err) {
        console.warn('loadShop error:', err);
      }
    };

    loadShop();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [publicShopId, resolvedShopUid, shopResolved]);

  useEffect(() => () => {
    if (unsubRef.current) unsubRef.current();
  }, []);

  // Auto-open highlighted item
  useEffect(() => {
    if (!highlightId || !items.length) return;
    const key = `${publicShopId}:${highlightId}`;
    if (autoOpenedRef.current === key) return;

    const itemToOpen = items.find((i) => i.id === highlightId);
    if (!itemToOpen) return;

    autoOpenedRef.current = key;
    setSelItem(itemToOpen);

    setTimeout(() => {
      const el = document.getElementById(`cc-item-${highlightId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [highlightId, items, publicShopId]);

  // Cart actions
  const addToCart = useCallback((item, qty) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      const priceInfo = calcPrice(item);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, qty: c.qty + qty, priceInfo } : c
        );
      }
      return [...prev, { item, qty, priceInfo }];
    });
    showToastMessage(`${item.sinhalaName || item.name} ${TEXT.addedToCart}`);
  }, [showToastMessage]);

  const updateCartQty = useCallback((itemId, newQty) => {
    setCart((prev) =>
      prev.map((c) =>
        c.item.id === itemId ? { ...c, qty: Math.max(1, newQty) } : c
      )
    );
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    if (publicShopId) {
      try { localStorage.removeItem(`cart_${publicShopId}`); } catch {}
    }
  }, [publicShopId]);

  const handleContactClick = useCallback((item) => setContactItem(item), []);
  const handleShareClick = useCallback((item) => setShareItem(item), []);

  const closeSelectedItem = useCallback(() => {
    setSelItem(null);
    if (highlightId && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('highlight');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [highlightId, router]);

  const handleShopSelect = useCallback((newShopId, shopData) => {
    if (newShopId === publicShopId) {
      showToastMessage(`${shopData?.name || ''} — දැනටමත් මෙම වෙළඳසැලේ සිටී`);
      return;
    }

    setCart([]);
    setSearch('');
    setSelCat('');
    setSelBrand('');
    setSortBy('default');
    setSelItem(null);
    setShowSort(false);
    setActiveShopId(newShopId);

    if (!embedded) {
      const nextUrl = `/pfi/${newShopId}`;
      router.push(nextUrl);
    }

    showToastMessage(`${shopData?.name || ''} ${TEXT.shopSelected}`);
  }, [publicShopId, showToastMessage, embedded, router]);

  // Derived
  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const cats = useMemo(() => {
    const s = new Set();
    items.forEach((i) => {
      if (!i.isHidden && !i.isPurchaseOnly && i.categoryName) s.add(i.categoryName);
    });
    return [...s].sort();
  }, [items]);

  const brands = useMemo(() => {
    const s = new Set();
    items.forEach((i) => {
      if (!i.isHidden && !i.isPurchaseOnly && i.brandName) s.add(i.brandName);
    });
    return [...s].sort();
  }, [items]);

  const visible = useMemo(() => {
    let f = items.filter((i) => !i.isHidden && !i.isPurchaseOnly);
    f = smartSearch(f, search);

    if (selCat) f = f.filter((i) => i.categoryName === selCat);
    if (selBrand) f = f.filter((i) => i.brandName === selBrand);

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

  const totalCount = useMemo(
    () => items.filter((i) => !i.isHidden && !i.isPurchaseOnly).length,
    [items]
  );

  const hasFilters = !!(search || selCat || selBrand || sortBy !== 'default');

  const clearAll = useCallback(() => {
    setSearch('');
    setSelCat('');
    setSelBrand('');
    setSortBy('default');
  }, []);

  // Loading
  if (loading || !shopResolved) {
    return (
      <div
        id="customer-catalog-root"
        style={
          embedded
            ? {
                position: 'relative',
                width: '100%',
                minHeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 12,
                background: '#f8fafc',
                borderRadius: 12,
              }
            : {
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 12,
              }
        }
      >
        <GlobalStyles embedded={embedded} />
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'ccSpin 1s linear infinite',
          }}
        />
        <p
          style={{
            color: '#475569',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {TEXT.loading}
        </p>
      </div>
    );
  }

  if (!publicShopId) {
    return (
      <div
        id="customer-catalog-root"
        style={
          embedded
            ? {
                position: 'relative',
                width: '100%',
                minHeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8fafc',
                borderRadius: 12,
              }
            : { alignItems: 'center', justifyContent: 'center' }
        }
      >
        <GlobalStyles embedded={embedded} />
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>🏪</div>
          <p
            style={{
              color: '#475569',
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {TEXT.noShop}
          </p>
          <button
            onClick={() => setShowShopSelector(true)}
            style={{
              padding: '14px 28px',
              background: 'linear-gradient(135deg,#7c3aed,#3b82f6)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 800,
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(124,58,237,0.35)',
            }}
          >
            🏪 {TEXT.selectShop}
          </button>
        </div>
        {showShopSelector && (
          <ShopSelectorModal
            currentShopId={publicShopId}
            onSelectShop={handleShopSelect}
            onClose={() => setShowShopSelector(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div id="customer-catalog-root">
      <GlobalStyles embedded={embedded} />
      <Toast message={toastMsg} show={showToast} />

      <div className="cc-main">
        {/* HEADER */}
        <header
          style={{
            background: 'white',
            borderBottom: '1px solid #e2e8f0',
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 30,
            borderRadius: embedded ? '12px 12px 0 0' : '0',
          }}
        >
          <div
            style={{
              padding: '12px 14px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flex: 1,
                minWidth: 0,
              }}
            >
              <button
                onClick={() => setShowShopSelector(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg,#ede9fe,#dbeafe)',
                  border: '2px solid #c4b5fd',
                  borderRadius: 14,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(124,58,237,0.12)',
                }}
                title={TEXT.changeShop}
              >
                <span style={{ fontSize: 22 }}>🏪</span>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  {shopInfo?.shopName ? (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#5b21b6',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 140,
                        }}
                      >
                        {shopInfo.shopName}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: '#7c3aed',
                          fontWeight: 600,
                        }}
                      >
                        🔄 {TEXT.changeShop}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#5b21b6',
                      }}
                    >
                      {TEXT.selectShop}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 14,
                    color: '#7c3aed',
                    fontWeight: 800,
                    marginLeft: 2,
                  }}
                >
                  ▾
                </span>
              </button>

              <div style={{ minWidth: 0 }}>
                <h1
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: '#0f172a',
                    margin: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  📦 {TEXT.catalog}
                </h1>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                flexShrink: 0,
              }}
            >
              {cartCount > 0 && (
                <button
                  className="cc-mobile-only"
                  onClick={() => setShowMobileCart(true)}
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background:
                    showSort || hasFilters ? '#eff6ff' : '#f1f5f9',
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

          {/* Search */}
          <div style={{ padding: '0 14px 8px' }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 11,
                  color: '#94a3b8',
                  fontSize: 13,
                  pointerEvents: 'none',
                }}
              >
                🔍
              </span>
              <input
                ref={searchRef}
                type="text"
                style={{
                  width: '100%',
                  padding: '10px 34px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 11,
                  fontSize: 13,
                  color: '#1e293b',
                  background: '#f8fafc',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                placeholder={TEXT.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  style={{
                    position: 'absolute',
                    right: 9,
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
                    color: '#374151',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          {cats.length > 0 && (
            <div
              style={{
                padding: '0 14px 9px',
                display: 'flex',
                gap: 5,
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              <button
                onClick={() => setSelCat('')}
                style={{
                  flexShrink: 0,
                  padding: '5px 13px',
                  borderRadius: 18,
                  fontSize: 11,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: !selCat ? '#3b82f6' : '#f1f5f9',
                  color: !selCat ? 'white' : '#374151',
                }}
              >
                {TEXT.all}
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelCat(selCat === c ? '' : c)}
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
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Sort panel */}
          {showSort && (
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 5,
                  flexWrap: 'wrap',
                  marginBottom: 9,
                }}
              >
                {SORT_OPTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSortBy(s.key)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 600,
                      border:
                        sortBy === s.key ? 'none' : '1px solid #cbd5e1',
                      cursor: 'pointer',
                      background:
                        sortBy === s.key ? '#3b82f6' : 'white',
                      color:
                        sortBy === s.key ? 'white' : '#374151',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {brands.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 5,
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: '#374151',
                      fontWeight: 700,
                      alignSelf: 'center',
                    }}
                  >
                    {TEXT.brands}:
                  </span>
                  <button
                    onClick={() => setSelBrand('')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      border:
                        !selBrand ? 'none' : '1px solid #cbd5e1',
                      cursor: 'pointer',
                      background:
                        !selBrand ? '#8b5cf6' : 'white',
                      color: !selBrand ? 'white' : '#374151',
                    }}
                  >
                    {TEXT.all}
                  </button>
                  {brands.map((b) => (
                    <button
                      key={b}
                      onClick={() => setSelBrand(selBrand === b ? '' : b)}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 600,
                        border:
                          selBrand === b ? 'none' : '1px solid #cbd5e1',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background:
                          selBrand === b ? '#8b5cf6' : 'white',
                        color:
                          selBrand === b ? 'white' : '#374151',
                      }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}

              {hasFilters && (
                <button
                  onClick={clearAll}
                  style={{
                    width: '100%',
                    padding: '9px 0',
                    borderRadius: 9,
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: 11,
                    fontWeight: 700,
                    border: '1px solid #fecaca',
                    cursor: 'pointer',
                  }}
                >
                  {TEXT.clearAll}
                </button>
              )}
            </div>
          )}

          {/* Count */}
          <div
            style={{
              padding: '4px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f1f5f9',
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: '#374151',
                fontWeight: 600,
              }}
            >
              {TEXT.showing} <b>{visible.length}</b> {TEXT.of} {totalCount}{' '}
              {TEXT.found}
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

        {/* PRODUCT GRID */}
        <div className="cc-main-body">
          {visible.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '56px 20px',
                background: 'white',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                margin: 14,
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 10 }}>📦</div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#1e293b',
                  marginBottom: 5,
                }}
              >
                {items.length === 0
                  ? TEXT.noItemsRegistered
                  : TEXT.noResults}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: '#475569',
                  marginBottom: 14,
                }}
              >
                {items.length === 0
                  ? `Shop ID: ${publicShopId} | UID: ${resolvedShopUid || 'not resolved'}`
                  : TEXT.tryAgain}
              </p>
              {hasFilters && (
                <button
                  onClick={clearAll}
                  style={{
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
                  {TEXT.clearSearch}
                </button>
              )}
            </div>
          ) : (
            <div className="cc-grid">
              {visible.map((item) => (
                <div key={item.id} id={`cc-item-${item.id}`}>
                  <Card
                    item={item}
                    onClick={setSelItem}
                    onAddToCart={addToCart}
                    onContactClick={handleContactClick}
                    onShareClick={handleShareClick}
                    shopId={publicShopId}
                  />
                </div>
              ))}
            </div>
          )}
          <div style={{ height: 20 }} />
        </div>
      </div>

      {/* DESKTOP CART */}
      <DesktopCartSidebar
        cart={cart}
        onUpdateQty={updateCartQty}
        onRemove={removeFromCart}
        onClearCart={clearCart}
        shopUid={resolvedShopUid}
        publicShopId={publicShopId}
        shopInfo={shopInfo}
      />

      {/* MOBILE CART FAB */}
      {cartCount > 0 && (
        <button
          className="cc-mobile-only"
          onClick={() => setShowMobileCart(true)}
          aria-label={`${TEXT.cart} ${cartCount}`}
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(59,130,246,0.5)',
            animation: 'ccPulse 2s infinite',
            color: 'white',
            fontSize: 24,
          }}
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
              padding: '0 3px',
            }}
          >
            {cartCount}
          </span>
        </button>
      )}

      {/* MODALS */}
      {showMobileCart && (
        <MobileCartModal
          cart={cart}
          onClose={() => setShowMobileCart(false)}
          onUpdateQty={updateCartQty}
          onRemove={removeFromCart}
          onClearCart={clearCart}
          shopUid={resolvedShopUid}
          publicShopId={publicShopId}
          shopInfo={shopInfo}
        />
      )}

      {selItem && (
        <DetailModal
          item={selItem}
          onClose={closeSelectedItem}
          onAddToCart={addToCart}
          onContactClick={(item) => {
            closeSelectedItem();
            setContactItem(item);
          }}
          onShareClick={(item) => {
            setShareItem(item);
          }}
          shopId={publicShopId}
        />
      )}

      {showShopSelector && (
        <ShopSelectorModal
          currentShopId={publicShopId}
          onSelectShop={handleShopSelect}
          onClose={() => setShowShopSelector(false)}
        />
      )}

      {shareItem && (
        <ShareModal
          item={shareItem}
          shopId={publicShopId}
          shopInfo={shopInfo}
          onClose={() => setShareItem(null)}
          onToast={showToastMessage}
        />
      )}

      {contactItem && (
        <ContactPhoneModal
          item={contactItem}
          shopInfo={shopInfo}
          onClose={() => setContactItem(null)}
        />
      )}
    </div>
  );
}
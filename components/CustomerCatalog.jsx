'use client';

// components/CustomerCatalog.jsx
// Next.js App Router compatible
// ★ v2 — Auto-load logged-in user's shop

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useUserAuth } from '@/context/UserContext';
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

/* ═══════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════ */
const CATALOG_BASE = (
  process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app'
).replace(/\/$/, '');

const DEFAULT_IMG =
  'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';
const DEFAULT_SHOP_IMG =
  'https://placehold.co/80x80/dbeafe/3b82f6?text=Shop';

const SORT_OPTIONS = [
  { key: 'default',   label: 'Default' },
  { key: 'priceLow',  label: 'Price Low' },
  { key: 'priceHigh', label: 'Price High' },
  { key: 'az',        label: 'Name A-Z' },
];

const TEXT = {
  si: {
    catalog:           'භාණ්ඩ නාමාවලිය',
    search:            'සොයන්න...',
    all:               'සියල්ල',
    noResults:         'භාණ්ඩ හමු නොවීය',
    tryAgain:          'වෙනත් වචනයකින් සොයන්න',
    addToCart:         'කරත්තයට',
    contactForPrice:   'මිල සඳහා අමතන්න',
    perUnit:           'එකකට',
    save:              'ඉතිරිය',
    desc:              'විස්තරය',
    loading:           'දත්ත ලබා ගනිමින්...',
    noShop:            'වෙළඳසැල හමු නොවීය',
    found:             'හමුවිය',
    brands:            'Brands',
    qty:               'ප්‍රමාණය',
    cart:              'කරත්තය',
    checkout:          'ඇනවුම් කරන්න',
    emptyCart:         'කරත්තය හිස්ය',
    emptyCartDesc:     'භාණ්ඩ එකතු කරන්න',
    customerName:      'ඔබේ නම',
    customerPhone:     'දුරකථන අංකය',
    customerAddress:   'ලිපිනය',
    orderNote:         'විශේෂ සටහන්',
    placeOrder:        'ඇනවුම තහවුරු කරන්න',
    orderSuccess:      'ඇනවුම සාර්ථකයි!',
    orderSuccessDesc:  'ඔබේ ඇනවුම ලැබුණි. අපි ඉක්මනින් ඔබව සම්බන්ධ කරගන්නෙමු.',
    continueShopping:  'දිගටම මිලදී ගන්න',
    required:          'අවශ්‍යයි',
    submitting:        'යවමින්...',
    addedToCart:       'කරත්තයට එකතු කළා',
    orderSummary:      'ඇනවුම් සාරාංශය',
    grossTotal:        'මුළු මිල',
    discount:          'වට්ටම්',
    grandTotal:        'ගෙවිය යුතු මුදල',
    back:              'ආපසු',
    yourInfo:          'ඔබේ තොරතුරු',
    orderPlaced:       'ඇනවුම ලැබුණි',
    oosCartNote:       'තොග නොමැති භාණ්ඩ සඳහා මිල ඇනවුමෙන් පසු දැනුම් දෙනු ලැබේ.',
    clearAll:          'Clear All Filters',
    clearSearch:       'Clear Search',
    showing:           'Showing',
    of:                'of',
    checkoutTitle:     'ඇනවුම් විස්තර',
    callNow:           'දැන්ම අමතන්න',
    whatsappNow:       'WhatsApp',
    noPhoneAvailable:  'දුරකථන අංකයක් ලබා දී නැත',
    closeModal:        'වසන්න',
    priceInquiry:      'මිල විමසීම',
    priceInquiryDesc:  'මෙම භාණ්ඩයේ මිල දැනගැනීමට වෙළඳසැල අමතන්න',
    shareWhatsApp:     'WhatsApp',
    shareCopy:         'Link Copy',
    shareCopied:       'Link copy කළා',
    shareFailed:       'Share අසාර්ථක',
    shareItem:         'Share කරන්න',
    selectShop:        'වෙළඳසැල තෝරන්න',
    changeShop:        'වෙළඳසැල මාරු කරන්න',
    searchShop:        'වෙළඳසැල සොයන්න...',
    noShopsFound:      'වෙළඳසැල් හමු නොවීය',
    loadingShops:      'වෙළඳසැල් ලබා ගනිමින්...',
    shopItems:         'භාණ්ඩ',
    currentShop:       'දැනට තෝරාගත්',
    allShops:          'සියලුම වෙළඳසැල්',
    selectShopDesc:    'ඇනවුම් කිරීමට වෙළඳසැලක් තෝරන්න',
    shopSelected:      'තෝරාගත්තා',
    noItemsRegistered: 'මෙම වෙළඳසැලේ භාණ්ඩ ලියාපදිංචි කර නැත',
    share:             'Share',
    myShop:            'මගේ වෙළඳසැල',
  },
  en: {
    catalog:           'Product Catalog',
    search:            'Search...',
    all:               'All',
    noResults:         'No products found',
    tryAgain:          'Try different keywords',
    addToCart:         'Add to Cart',
    contactForPrice:   'Contact for Price',
    perUnit:           'per',
    save:              'Save',
    desc:              'Description',
    loading:           'Loading...',
    noShop:            'Shop not found',
    found:             'found',
    brands:            'Brands',
    qty:               'Qty',
    cart:              'Cart',
    checkout:          'Checkout',
    emptyCart:         'Cart is empty',
    emptyCartDesc:     'Add items to cart',
    customerName:      'Your Name',
    customerPhone:     'Phone Number',
    customerAddress:   'Address',
    orderNote:         'Special Notes',
    placeOrder:        'Confirm Order',
    orderSuccess:      'Order Placed!',
    orderSuccessDesc:  'Your order has been received. We will contact you soon.',
    continueShopping:  'Continue Shopping',
    required:          'Required',
    submitting:        'Submitting...',
    addedToCart:       'Added to Cart',
    orderSummary:      'Order Summary',
    grossTotal:        'Gross Total',
    discount:          'Discount',
    grandTotal:        'Grand Total',
    back:              'Back',
    yourInfo:          'Your Details',
    orderPlaced:       'Order Placed',
    oosCartNote:       'Out of stock items will be quoted after order.',
    clearAll:          'Clear All Filters',
    clearSearch:       'Clear Search',
    showing:           'Showing',
    of:                'of',
    checkoutTitle:     'Order Details',
    callNow:           'Call Now',
    whatsappNow:       'WhatsApp',
    noPhoneAvailable:  'No phone number provided',
    closeModal:        'Close',
    priceInquiry:      'Price Inquiry',
    priceInquiryDesc:  'Contact shop for price',
    shareWhatsApp:     'WhatsApp',
    shareCopy:         'Copy Link',
    shareCopied:       'Link Copied',
    shareFailed:       'Share Failed',
    shareItem:         'Share Item',
    selectShop:        'Select Shop',
    changeShop:        'Change Shop',
    searchShop:        'Search shop...',
    noShopsFound:      'No shops found',
    loadingShops:      'Loading shops...',
    shopItems:         'Items',
    currentShop:       'Current',
    allShops:          'All Shops',
    selectShopDesc:    'Select a shop to browse products',
    shopSelected:      'Selected',
    noItemsRegistered: 'No items registered for this shop',
    share:             'Share',
    myShop:            'My Shop',
  },
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
    if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:image'))) {
      return c;
    }
  }
  return DEFAULT_IMG;
};

const getShopImg = (shop) => {
  if (!shop) return DEFAULT_SHOP_IMG;
  for (const c of [shop.logo, shop.logoUrl, shop.shopLogo, shop.image, shop.photoURL, shop.picture]) {
    if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:image'))) {
      return c;
    }
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
  let base = 0, disc = 0;
  switch (item.catalogPriceType) {
    case 'wholesale':
      base = parseFloat(item.sellingPriceWholesale) || 0;
      disc = parseFloat(item.wholesaleDiscount) || 0;
      break;
    case 'loose':
      base = parseFloat(item.sellingPriceLoose) || 0;
      disc = parseFloat(item.looseDiscount) || 0;
      break;
    default:
      base = parseFloat(item.sellingPriceRetail) || 0;
      disc = parseFloat(item.retailDiscount) || 0;
  }
  const discAmt = base * (disc / 100);
  const final   = base - discAmt;
  let factor    = 1;
  if (item.catalogUom && item.catalogUom !== item.uomName && item.availableUnits?.length) {
    const c = item.availableUnits.find((u) => u.toUnitName === item.catalogUom);
    if (c && parseFloat(c.factor) > 0) factor = parseFloat(c.factor);
  }
  return {
    orig:    base / factor,
    discAmt: discAmt / factor,
    final:   final / factor,
    discPct: disc,
    unit:    item.catalogUom || item.uomName || '',
    hasDsc:  disc > 0 && discAmt > 0,
    label:   item.catalogPriceType || 'retail',
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
  return items.filter((item) => {
    const text = [
      item.name, item.sinhalaName, item.itemCode, item.barcode,
      item.modelKeyCode, item.brandName, item.categoryName,
    ].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
};

const truncateText = (text, max = 60) => {
  const s = String(text || '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

const getShareUrl = (shopId, itemId) =>
  `${CATALOG_BASE}/pfi/${shopId}/item/${itemId}`;

const formatPhoneForCall = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/[\s\-\(\)]/g, '');
  if (c.startsWith('0094')) c = '+' + c.substring(2);
  if (c.startsWith('094'))  c = '+' + c.substring(1);
  if (c.startsWith('94') && !c.startsWith('+94')) c = '+' + c;
  if (c.startsWith('0')) c = '+94' + c.substring(1);
  if (!c.startsWith('+')) c = '+94' + c;
  return c;
};

const formatPhoneForWhatsApp = (phone) => {
  if (!phone) return '';
  let c = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('0094')) c = c.substring(2);
  if (c.startsWith('094'))  c = c.substring(1);
  if (c.startsWith('0'))    c = '94' + c.substring(1);
  if (c.length === 9)       c = '94' + c;
  return c;
};

/* ═══════════════════════════════════════
   RESOLVE SHOP UID
═══════════════════════════════════════ */
const resolvePublicShopToUid = async (rawShopId) => {
  if (!rawShopId) return '';

  try {
    const userSnap = await getDoc(doc(db, 'users', rawShopId));
    if (userSnap.exists()) return rawShopId;
  } catch {}

  try {
    const dirSnap = await getDoc(doc(db, 'shopDirectory', rawShopId));
    if (dirSnap.exists()) {
      const d = dirSnap.data();
      return d.uid || d.userId || d.ownerUid || d.ownerId || rawShopId;
    }
  } catch {}

  for (const field of ['shopSlug', 'slug', 'publicId', 'catalogSlug']) {
    try {
      const snap = await getDocs(
        query(collection(db, 'shopDirectory'), where(field, '==', rawShopId), limit(1))
      );
      if (!snap.empty) {
        const d = snap.docs[0].data();
        return d.uid || d.userId || d.ownerUid || snap.docs[0].id;
      }
    } catch {}
  }

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
const GlobalStyles = memo(() => (
  <style>{`
    #cc-root * { box-sizing: border-box; }
    @keyframes ccToastIn { from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
    @keyframes ccSlideUp { from{transform:translateY(100%)}to{transform:translateY(0)} }
    @keyframes ccFadeIn  { from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)} }
    @keyframes ccSpin    { to{transform:rotate(360deg)} }
    @keyframes ccPulse   { 0%{box-shadow:0 0 0 0 rgba(59,130,246,.6)}70%{box-shadow:0 0 0 10px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)} }
    @keyframes ccPhoneRing { 0%,100%{transform:rotate(0)}10%{transform:rotate(14deg)}20%{transform:rotate(-14deg)}30%{transform:rotate(10deg)}40%{transform:rotate(-10deg)} }
    #cc-root {
      position:fixed;inset:0;z-index:200;
      display:flex;overflow:hidden;
      background:#f8fafc;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    .cc-main { flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden }
    .cc-body { flex:1;overflow-y:auto }
    .cc-body::-webkit-scrollbar { width:5px }
    .cc-body::-webkit-scrollbar-thumb { background:#cbd5e1;border-radius:3px }
    .cc-sidebar {
      width:320px;min-width:320px;background:white;
      border-left:1px solid #e2e8f0;
      display:flex;flex-direction:column;overflow:hidden
    }
    .cc-grid {
      display:grid;padding:10px;gap:10px;
      grid-template-columns:repeat(2,1fr);
    }
    @media(min-width:480px){.cc-grid{grid-template-columns:repeat(3,1fr)}}
    @media(min-width:900px){.cc-grid{grid-template-columns:repeat(3,1fr)}}
    @media(min-width:1100px){.cc-grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:899px){
      .cc-sidebar{display:none!important}
      .cc-desktop{display:none!important}
    }
    @media(min-width:900px){.cc-mobile{display:none!important}}
    .cc-card{transition:transform .15s,box-shadow .15s;cursor:pointer}
    .cc-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.10)!important}
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
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
    <div style={{
      position: 'fixed', top: 20, left: '50%',
      transform: 'translateX(-50%)',
      background: '#10b981', color: 'white',
      padding: '10px 20px', borderRadius: 10,
      fontSize: 13, fontWeight: 700, zIndex: 99999,
      boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
      animation: 'ccToastIn .3s ease-out',
      whiteSpace: 'nowrap', maxWidth: '80vw',
    }}>
      {message}
    </div>
  );
});
Toast.displayName = 'Toast';

/* ═══════════════════════════════════════
   SHOP SELECTOR MODAL
═══════════════════════════════════════ */
const ShopSelectorModal = memo(({ currentShopId, onSelectShop, onClose, t }) => {
  const [shops,   setShops]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [error,   setError]   = useState(null);
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

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 300); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
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

        const merged = new Map();

        dirSnap.docs.forEach((d) => {
          const s = { id: d.id, ...d.data() };
          merged.set(s.id, {
            id: s.id,
            name: s.shopName || s.businessName || s.companyName || s.name || '',
            address: s.address || s.location || '',
            phone: s.phone || s.contactPhone || s.mobile || '',
            logo: getShopImg(s),
            itemCount: 0,
          });
        });

        usersSnap.docs.forEach((d) => {
          const s = d.data();
          const uid = d.id;
          const name = s.shopName || s.businessName || s.displayName || '';
          if (!name && !itemCountMap[uid]) return;
          if (!merged.has(uid)) {
            merged.set(uid, {
              id: uid,
              name: name || `Shop ${uid.substring(0, 6)}`,
              address: s.address || '',
              phone: s.phone || s.contactPhone || '',
              logo: getShopImg(s),
              itemCount: 0,
            });
          }
        });

        merged.forEach((shop, id) => {
          shop.itemCount = itemCountMap[id] || 0;
        });

        const all = [...merged.values()]
          .filter((s) => s.name)
          .sort((a, b) => {
            if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
            return a.name.localeCompare(b.name);
          });

        setShops(all);
        setLoading(false);
      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return shops;
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return shops.filter((s) => {
      const text = [s.name, s.address, s.phone].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [shops, search]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 480, maxHeight: '90vh', background: 'white', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'ccFadeIn .25s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,0.9)', color: '#1e293b', width: 32, height: 32, borderRadius: '50%', border: 'none', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}>X</button>

        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', padding: '24px 20px 18px', textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>🏪</div>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 900, margin: '0 0 4px' }}>{t.selectShop}</h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: 0 }}>{t.selectShopDesc}</p>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input
              ref={searchRef}
              type="text"
              placeholder={t.searchShop}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 32px 10px 36px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: '#e2e8f0', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 9 }}>X</button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 16px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'ccSpin 1s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ color: '#64748b', fontSize: 13 }}>{t.loadingShops}</p>
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: 'center', padding: 24, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
              <p style={{ fontSize: 12, color: '#991b1b' }}>{error}</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36 }}>
              <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.4 }}>🔍</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{t.noShopsFound}</p>
            </div>
          )}

          {!loading && !error && filtered.map((shop) => {
            const isCurrent = shop.id === currentShopId;
            const hasItems  = shop.itemCount > 0;
            return (
              <div
                key={shop.id}
                onClick={() => { onSelectShop(shop.id, shop); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', marginBottom: 8,
                  background: isCurrent ? 'linear-gradient(135deg,#ede9fe,#dbeafe)' : hasItems ? 'white' : '#fafafa',
                  borderRadius: 14,
                  border: isCurrent ? '2px solid #7c3aed' : hasItems ? '1px solid #e2e8f0' : '1px solid #f1f5f9',
                  cursor: 'pointer', opacity: hasItems ? 1 : 0.6,
                }}
              >
                <img
                  src={shop.logo} alt={shop.name}
                  style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '2px solid #e2e8f0' }}
                  onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_SHOP_IMG; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {shop.name}
                    {isCurrent && (
                      <span style={{ fontSize: 8, background: '#7c3aed', color: 'white', padding: '2px 6px', borderRadius: 99 }}>
                        {t.currentShop}
                      </span>
                    )}
                  </div>
                  {shop.address && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      📍 {truncateText(shop.address)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ padding: '4px 10px', borderRadius: 10, background: hasItems ? '#3b82f6' : '#f1f5f9', color: hasItems ? 'white' : '#94a3b8' }}>
                    <div style={{ fontSize: 16, fontWeight: 900 }}>{shop.itemCount}</div>
                    <div style={{ fontSize: 8, fontWeight: 600 }}>{t.shopItems}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: '100%', padding: '11px 0', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t.closeModal}
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
const ShareModal = memo(({ item, shopId, shopInfo, onClose, onToast, t }) => {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const name    = item.sinhalaName || item.name || '';
  const img     = getImg(item);
  const p       = calcPrice(item);
  const oos     = isOutOfStock(item);
  const unit    = getDisplayUnit(item);
  const itemUrl = getShareUrl(shopId, item.id);
  const waMsg   = encodeURIComponent(itemUrl);

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(itemUrl);
      else {
        const ta = document.createElement('textarea');
        ta.value = itemUrl;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onToast(t.shareCopied);
      onClose();
    } catch { onToast(t.shareFailed); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(4px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'white', borderRadius: 20, overflow: 'hidden', animation: 'ccSlideUp .28s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(255,255,255,0.9)', color: '#1e293b', width: 30, height: 30, borderRadius: '50%', border: 'none', fontSize: 12, cursor: 'pointer' }}>X</button>

        <div style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', padding: '22px 18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 5 }}>📤</div>
          <h3 style={{ color: 'white', fontSize: 16, fontWeight: 800, margin: 0 }}>{t.shareItem}</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <img src={img} alt={name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '2px solid #e2e8f0', flexShrink: 0 }} onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{name}</div>
            {!oos ? (
              <div style={{ fontSize: 14, fontWeight: 900, color: '#047857', marginTop: 2 }}>
                Rs. {fmtAmt(p.final)}
                {unit && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}> / {unit}</span>}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, marginTop: 2 }}>📞 {t.contactForPrice}</div>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href={`https://wa.me/?text=${waMsg}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#25d366,#128c7e)', color: 'white', borderRadius: 12, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}
            onClick={onClose}
          >
            💬 {t.shareWhatsApp}
          </a>
          <button
            onClick={copyLink}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', borderRadius: 12, fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            🔗 {t.shareCopy}
          </button>
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '10px 0', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t.closeModal}</button>
        </div>
      </div>
    </div>
  );
});
ShareModal.displayName = 'ShareModal';

/* ═══════════════════════════════════════
   CONTACT PHONE MODAL
═══════════════════════════════════════ */
const ContactPhoneModal = memo(({ item, shopInfo, onClose, t }) => {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const name      = item.sinhalaName || item.name || '';
  const img       = getImg(item);
  const shopPhone = shopInfo?.phone || '';
  const waPhone   = shopInfo?.whatsapp || shopPhone;
  const callLink  = formatPhoneForCall(shopPhone);
  const waLink    = formatPhoneForWhatsApp(waPhone);
  const waMsg     = encodeURIComponent(`සුබ දවසක් 🙏\n\n"${name}" භාණ්ඩයේ මිල දැනගැනීමට කැමැත්තෙමි.\n\nස්තූතියි!`);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(4px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'white', borderRadius: 20, overflow: 'hidden', animation: 'ccSlideUp .28s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(255,255,255,0.9)', color: '#1e293b', width: 30, height: 30, borderRadius: '50%', border: 'none', fontSize: 12, cursor: 'pointer' }}>X</button>

        <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '24px 18px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 38, marginBottom: 6, display: 'inline-block', animation: 'ccPhoneRing 1.5s ease-in-out infinite' }}>📞</div>
          <h3 style={{ color: 'white', fontSize: 16, fontWeight: 800, margin: '0 0 3px' }}>{t.priceInquiry}</h3>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, margin: 0 }}>{t.priceInquiryDesc}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <img src={img} alt={name} style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', border: '2px solid #e2e8f0', flexShrink: 0 }} onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }} />
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{name}</div>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {shopInfo?.shopName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '9px 12px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: 18 }}>🏪</span>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#166534' }}>{shopInfo.shopName}</div>
            </div>
          )}

          {shopPhone ? (
            <>
              <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius: 12, padding: 14, textAlign: 'center', marginBottom: 12, border: '2px solid #93c5fd' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#1e40af', fontFamily: 'monospace', letterSpacing: '1.5px' }}>{shopPhone}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href={`tel:${callLink}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', borderRadius: 12, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                  📞 {t.callNow}
                </a>
                {waLink && (
                  <a href={`https://wa.me/${waLink}?text=${waMsg}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#25d366,#128c7e)', color: 'white', borderRadius: 12, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                    💬 {t.whatsappNow}
                  </a>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 10px', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>😔</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>{t.noPhoneAvailable}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '10px 0', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t.closeModal}</button>
        </div>
      </div>
    </div>
  );
});
ContactPhoneModal.displayName = 'ContactPhoneModal';

/* ═══════════════════════════════════════
   DETAIL MODAL
═══════════════════════════════════════ */
const DetailModal = memo(({ item, onClose, onAddToCart, onContactClick, onShareClick, shopId, t }) => {
  const [imgIdx, setImgIdx] = useState(0);
  const [qty,    setQty]    = useState(1);

  useEffect(() => { setImgIdx(0); setQty(1); }, [item?.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!item) return null;

  const p           = calcPrice(item);
  const oos         = isOutOfStock(item);
  const displayUnit = getDisplayUnit(item);
  const brand       = getBrandName(item);
  const name        = item.sinhalaName || item.name || '';
  const englishName = item.sinhalaName && item.name ? item.name : '';
  const imgs        = item.images?.length > 0 ? item.images : [getImg(item)];
  const itemUrl     = getShareUrl(shopId, item.id);
  const waMsg       = encodeURIComponent(itemUrl);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(4px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 460, maxHeight: '90vh', background: 'white', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'ccSlideUp .28s ease', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(255,255,255,0.9)', color: '#1e293b', width: 30, height: 30, borderRadius: '50%', border: 'none', fontSize: 12, cursor: 'pointer' }}>X</button>

        <div style={{ position: 'relative', width: '100%', height: 220, background: '#f8fafc', flexShrink: 0 }}>
          <img
            src={imgs[imgIdx] || DEFAULT_IMG}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }}
            onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }}
            alt={name}
          />

          <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
            <button onClick={(e) => { e.stopPropagation(); onShareClick(item); }} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.95)', cursor: 'pointer', fontSize: 14 }}>📤</button>
            <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#25d366', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>💬</a>
          </div>

          {!oos && p.hasDsc && (
            <span style={{ position: 'absolute', top: 8, right: 10, background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>-{p.discPct}%</span>
          )}

          {imgs.length > 1 && (
            <div style={{ position: 'absolute', bottom: 7, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
              {imgs.map((im, i) => (
                <button key={i} onClick={() => setImgIdx(i)} style={{ width: 28, height: 28, borderRadius: 6, border: imgIdx === i ? '2px solid #3b82f6' : '2px solid white', overflow: 'hidden', padding: 0, cursor: 'pointer' }}>
                  <img src={im} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>{name}</h2>
          {englishName && <p style={{ fontSize: 11, color: '#475569', margin: '0 0 8px' }}>{englishName}</p>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {brand && <span style={{ fontSize: 9, background: '#f3f0ff', color: '#6d28d9', padding: '2px 7px', borderRadius: 99, fontWeight: 700 }}>🏷️ {brand}</span>}
            {displayUnit && <span style={{ fontSize: 9, background: '#e0f2fe', color: '#075985', padding: '2px 7px', borderRadius: 99, fontWeight: 700 }}>📦 {displayUnit}</span>}
            {item.categoryName && <span style={{ fontSize: 9, background: '#faf5ff', color: '#7e22ce', padding: '2px 7px', borderRadius: 99, fontWeight: 700 }}>📁 {item.categoryName}</span>}
          </div>

          {!oos ? (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 10, borderRadius: 12, marginBottom: 10 }}>
              {p.hasDsc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>Rs. {fmtAmt(p.orig)}</span>
                  <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>-{p.discPct}%</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#047857' }}>Rs. {fmtAmt(p.final)}</span>
                {displayUnit && <span style={{ fontSize: 10, color: '#475569' }}>/ {displayUnit}</span>}
              </div>
              {p.hasDsc && (
                <div style={{ marginTop: 5, background: '#fef9c3', color: '#92400e', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, display: 'inline-block' }}>
                  💰 {t.save} Rs. {fmtAmt(p.discAmt)}
                </div>
              )}
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onContactClick(item); }} style={{ width: '100%', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', border: 'none', padding: 14, borderRadius: 12, textAlign: 'center', marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>📞</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>{t.contactForPrice}</div>
            </button>
          )}

          {item.description && (
            <div style={{ marginBottom: 10 }}>
              <h4 style={{ fontWeight: 700, color: '#334155', fontSize: 11, margin: '0 0 4px' }}>📝 {t.desc}</h4>
              <p style={{ color: '#475569', fontSize: 11, lineHeight: 1.6, margin: 0, background: '#f8fafc', padding: 9, borderRadius: 9 }}>{item.description}</p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: 12 }}>
            <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{t.qty}:</span>
            <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 34, height: 34, background: 'transparent', border: 'none', fontSize: 16, fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>-</button>
              <input type="number" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 44, height: 34, textAlign: 'center', fontSize: 13, fontWeight: 'bold', background: 'white', border: 'none', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', outline: 'none', color: '#0f172a' }} min="1" />
              <button onClick={() => setQty((q) => q + 1)} style={{ width: 34, height: 34, background: 'transparent', border: 'none', fontSize: 16, fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>+</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" style={{ width: 44, flexShrink: 0, background: '#25d366', color: 'white', padding: '11px 0', borderRadius: 11, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>💬</a>
            <button onClick={(e) => { e.stopPropagation(); onShareClick(item); }} style={{ width: 44, flexShrink: 0, background: '#eef2ff', color: '#3730a3', padding: '11px 0', borderRadius: 11, fontWeight: 800, fontSize: 16, border: '1px solid #c7d2fe', cursor: 'pointer' }}>📤</button>
            <button
              onClick={() => { onAddToCart(item, qty); onClose(); }}
              style={{ flex: 1, background: oos ? 'linear-gradient(135deg,#64748b,#475569)' : 'linear-gradient(135deg,#10b981,#059669)', color: 'white', padding: '11px 0', borderRadius: 11, fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer' }}
            >
              🛒 {t.addToCart}{!oos && ` - Rs.${fmtAmt(p.final * qty)}`}
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
  const p           = useMemo(() => calcPrice(item), [item]);
  const oos         = isOutOfStock(item);
  const displayUnit = getDisplayUnit(item);
  const brand       = getBrandName(item);
  const name        = item.sinhalaName || '';
  const enName      = item.name || '';
  const img         = getImg(item);
  const imgCount    = item.images?.length || (item.picture ? 1 : 0);
  const waMsg       = encodeURIComponent(getShareUrl(shopId, item.id));

  return (
    <div
      className="cc-card"
      style={{ background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', position: 'relative' }}
      onClick={() => onClick(item)}
    >
      <div style={{ position: 'relative', width: '100%', paddingTop: '100%', background: '#f8fafc', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={img}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }}
          alt={name || enName}
          loading="lazy"
        />
        <button onClick={(e) => { e.stopPropagation(); onShareClick(item); }} style={{ position: 'absolute', top: 5, left: 5, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.92)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📤</button>
        <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 5, left: 35, width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#25d366', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textDecoration: 'none' }}>💬</a>
        {!oos && p.hasDsc && <span style={{ position: 'absolute', top: 5, right: 5, background: '#dc2626', color: 'white', fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4 }}>-{p.discPct}%</span>}
        {imgCount > 1 && <span style={{ position: 'absolute', bottom: 5, right: 5, background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: 9, padding: '2px 5px', borderRadius: 4 }}>📸{imgCount}</span>}
      </div>

      <div style={{ padding: '8px 9px 10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {name && <h3 style={{ fontWeight: 700, color: '#1e293b', fontSize: 11, lineHeight: 1.5, margin: '0 0 2px', wordBreak: 'break-word' }}>{name}</h3>}
        {enName && <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, lineHeight: 1.4 }}>{enName}</div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 4 }}>
          {brand       && <span style={{ fontSize: 8, fontWeight: 700, color: '#6d28d9', background: '#f3f0ff', padding: '1px 4px', borderRadius: 3 }}>🏷️{brand}</span>}
          {displayUnit && <span style={{ fontSize: 8, fontWeight: 700, color: '#075985', background: '#e0f2fe', padding: '1px 4px', borderRadius: 3 }}>📦{displayUnit}</span>}
        </div>

        <div style={{ flexGrow: 1 }} />

        {!oos ? (
          <>
            {p.hasDsc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
                <span style={{ fontSize: 9, color: '#94a3b8', textDecoration: 'line-through' }}>Rs.{fmtAmt(p.orig)}</span>
                <span style={{ fontSize: 8, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '1px 3px', borderRadius: 3 }}>-{p.discPct}%</span>
              </div>
            )}
            <span style={{ fontSize: 13, fontWeight: 800, color: '#047857' }}>Rs.{fmtAmt(p.hasDsc ? p.final : p.orig)}</span>
            {displayUnit && <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{displayUnit}</div>}
          </>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onContactClick(item); }} style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', border: 'none', borderRadius: 7, padding: '7px', textAlign: 'center', cursor: 'pointer', width: '100%' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'white' }}>📞</div>
          </button>
        )}

        <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
          <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ width: 28, flexShrink: 0, background: '#25d366', color: 'white', border: 'none', padding: '7px 0', borderRadius: 8, fontWeight: 'bold', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>💬</a>
          <button onClick={(e) => { e.stopPropagation(); onShareClick(item); }} style={{ width: 28, flexShrink: 0, background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '7px 0', borderRadius: 8, fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>📤</button>
          <button onClick={(e) => { e.stopPropagation(); onAddToCart(item, 1); }} style={{ flex: 1, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', border: 'none', padding: '7px 0', borderRadius: 8, fontWeight: 'bold', fontSize: 10, cursor: 'pointer' }}>🛒</button>
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
  const name  = item.sinhalaName || item.name || '';
  const img   = getImg(item);
  const oos   = isOutOfStock(item);
  const price = oos ? 0 : priceInfo.final;

  return (
    <div style={{ display: 'flex', gap: 9, padding: '9px 0', borderBottom: !isLast ? '1px solid #f1f5f9' : 'none' }}>
      <img src={img} style={{ width: 48, height: 48, borderRadius: 7, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }} onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_IMG; }} alt={name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {oos ? (
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2, fontWeight: 600 }}>📞</div>
        ) : (
          <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', marginTop: 2 }}>{fmtPrice(price)} <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>x{qty}</span></div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
            <button onClick={() => onUpdateQty(item.id, Math.max(1, qty - 1))} style={{ width: 22, height: 22, background: 'transparent', border: 'none', fontSize: 12, fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>-</button>
            <span style={{ width: 22, textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#0f172a' }}>{qty}</span>
            <button onClick={() => onUpdateQty(item.id, qty + 1)} style={{ width: 22, height: 22, background: 'transparent', border: 'none', fontSize: 12, fontWeight: 'bold', color: '#334155', cursor: 'pointer' }}>+</button>
          </div>
          <button onClick={() => onRemove(item.id)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, padding: '2px 5px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>🗑️</button>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {!oos && <div style={{ fontWeight: 800, fontSize: 12, color: '#1e40af' }}>{fmtPrice(price * qty)}</div>}
        {!oos && priceInfo.hasDsc && <div style={{ fontSize: 9, color: '#ef4444' }}>-{fmtPrice(priceInfo.discAmt * qty)}</div>}
      </div>
    </div>
  );
});
CartItemRow.displayName = 'CartItemRow';

/* ═══════════════════════════════════════
   CHECKOUT FORM
═══════════════════════════════════════ */
const CheckoutForm = memo(({ cart, grossTotal, totalDiscount, grandTotal, hasOOS, shopUid, publicShopId, onSuccess, t }) => {
  const [customerName,    setCustomerName]    = useState(() => { try { return localStorage.getItem('cust_name') || ''; } catch { return ''; } });
  const [customerPhone,   setCustomerPhone]   = useState(() => { try { return localStorage.getItem('cust_phone') || ''; } catch { return ''; } });
  const [customerAddress, setCustomerAddress] = useState(() => { try { return localStorage.getItem('cust_address') || ''; } catch { return ''; } });
  const [orderNote,       setOrderNote]       = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [errors,          setErrors]          = useState({});

  const validate = useCallback(() => {
    const e = {};
    if (!customerName.trim()) e.name = true;
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 9) e.phone = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [customerName, customerPhone]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    if (!shopUid) { alert('Shop UID not resolved.'); return; }
    setSubmitting(true);
    try {
      try {
        localStorage.setItem('cust_name', customerName.trim());
        localStorage.setItem('cust_phone', customerPhone.trim());
        localStorage.setItem('cust_address', customerAddress.trim());
      } catch {}

      const standardizedItems = cart.map((c) => {
        const itemOOS   = isOutOfStock(c.item);
        const yourPrice = itemOOS ? 0 : c.priceInfo.final;
        return {
          id: c.item.id || '', name: c.item.name || '', sinhalaName: c.item.sinhalaName || '',
          qty: c.qty, quantity: c.qty,
          unitPrice: itemOOS ? 0 : c.priceInfo.orig,
          yourPrice, price: yourPrice,
          total: yourPrice * c.qty, lineTotal: yourPrice * c.qty,
          discount: (itemOOS ? 0 : c.priceInfo.discAmt) * c.qty,
          isOutOfStock: itemOOS,
          picture: getImg(c.item),
          uom: c.priceInfo.unit || c.item.uomName || '',
        };
      });

      const orderData = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        orderNote: orderNote.trim(),
        items: standardizedItems,
        grossTotal, totalDiscount, grandTotal, total: grandTotal,
        status: 'pending', hasOutOfStock: hasOOS,
        shopId: shopUid, uid: shopUid,
        publicShopId: publicShopId || shopUid,
        createdAt: serverTimestamp(),
        date: new Date().toISOString(),
        source: 'customer-catalog',
        itemCount: cart.reduce((s, c) => s + c.qty, 0),
      };

      await addDoc(collection(db, `shops/${shopUid}/pfis`), orderData);
      try { await addDoc(collection(db, 'orders'), orderData); } catch {}
      onSuccess();
    } catch (err) {
      alert(`ඇනවුම යැවීම අසාර්ථක විය.\n\n${err.message || ''}`);
    } finally {
      setSubmitting(false);
    }
  }, [validate, customerName, customerPhone, customerAddress, orderNote, cart, grossTotal, totalDiscount, grandTotal, hasOOS, shopUid, publicShopId, onSuccess]);

  const inp = (err) => ({
    width: '100%', padding: '9px 11px', borderRadius: 9,
    border: err ? '2px solid #ef4444' : '1px solid #cbd5e1',
    fontSize: 12, outline: 'none', boxSizing: 'border-box',
    background: err ? '#fef2f2' : 'white', color: '#1e293b',
  });

  return (
    <div>
      <h4 style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 10px' }}>👤 {t.yourInfo}</h4>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>{t.customerName} *</label>
        <input type="text" value={customerName} onChange={(e) => { setCustomerName(e.target.value); setErrors((p) => ({ ...p, name: false })); }} placeholder="Name" style={inp(errors.name)} />
        {errors.name && <span style={{ fontSize: 9, color: '#ef4444' }}>{t.required}</span>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>{t.customerPhone} *</label>
        <input type="tel" value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setErrors((p) => ({ ...p, phone: false })); }} placeholder="07XXXXXXXX" style={inp(errors.phone)} />
        {errors.phone && <span style={{ fontSize: 9, color: '#ef4444' }}>{t.required}</span>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>{t.customerAddress}</label>
        <textarea value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Address" rows={2} style={{ ...inp(false), resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>{t.orderNote}</label>
        <textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Notes..." rows={2} style={{ ...inp(false), resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, border: '1px solid #e2e8f0', marginBottom: 10 }}>
        <h4 style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>📋 {t.orderSummary}</h4>
        {cart.map((c, idx) => {
          const itemOOS = isOutOfStock(c.item);
          const price   = itemOOS ? 0 : c.priceInfo.final;
          return (
            <div key={c.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0', borderBottom: idx !== cart.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
              <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.item.sinhalaName || c.item.name} <span style={{ color: '#2563eb', fontWeight: 700 }}>x{c.qty}</span>
              </span>
              <span style={{ fontWeight: 700, color: itemOOS ? '#94a3b8' : '#1e293b', marginLeft: 5 }}>
                {itemOOS ? '-' : fmtAmt(price * c.qty)}
              </span>
            </div>
          );
        })}
        {totalDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#dc2626', marginTop: 5 }}>
            <span>🏷️ {t.discount}</span><span>-{fmtPrice(totalDiscount)}</span>
          </div>
        )}
        <div style={{ borderTop: '2px solid #334155', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 900, color: '#16a34a' }}>
          <span>{t.grandTotal}</span><span>Rs. {fmtAmt(grandTotal)}</span>
        </div>
      </div>

      {hasOOS && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>{t.oosCartNote}</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{ width: '100%', padding: '12px 0', background: submitting ? '#94a3b8' : 'linear-gradient(135deg,#10b981,#059669)', color: 'white', borderRadius: 11, fontWeight: 800, fontSize: 13, border: 'none', cursor: submitting ? 'wait' : 'pointer' }}
      >
        {submitting ? `${t.submitting}` : `${t.placeOrder} - Rs. ${fmtAmt(grandTotal)}`}
      </button>
    </div>
  );
});
CheckoutForm.displayName = 'CheckoutForm';

/* ═══════════════════════════════════════
   CART TOTALS HELPER
═══════════════════════════════════════ */
const calcTotals = (cart) => {
  let gross = 0, disc = 0, grand = 0, count = 0, oos = false;
  cart.forEach((c) => {
    const itemOOS = isOutOfStock(c.item);
    gross += c.priceInfo.orig * c.qty;
    disc  += c.priceInfo.discAmt * c.qty;
    grand += (itemOOS ? 0 : c.priceInfo.final) * c.qty;
    count += c.qty;
    if (itemOOS) oos = true;
  });
  return { grossTotal: gross, totalDiscount: disc, grandTotal: grand, totalItems: count, hasOOS: oos };
};

/* ═══════════════════════════════════════
   DESKTOP CART SIDEBAR
═══════════════════════════════════════ */
const DesktopCartSidebar = memo(({ cart, onUpdateQty, onRemove, onClearCart, shopUid, publicShopId, shopInfo, t }) => {
  const [view, setView] = useState('cart');
  const totals = useMemo(() => calcTotals(cart), [cart]);

  const handleSuccess = useCallback(() => { onClearCart(); setView('success'); }, [onClearCart]);
  useEffect(() => { if (cart.length === 0 && view === 'checkout') setView('cart'); }, [cart.length, view]);

  return (
    <aside className="cc-sidebar">
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {view === 'checkout' && (
            <button onClick={() => setView('cart')} style={{ background: '#f1f5f9', border: 'none', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', marginRight: 7, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>←</button>
          )}
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', flex: 1 }}>
            {view === 'cart' && `🛒 ${t.cart}`}
            {view === 'checkout' && `📝 ${t.checkoutTitle}`}
            {view === 'success' && `✅ ${t.orderPlaced}`}
          </h2>
          {view === 'cart' && totals.totalItems > 0 && (
            <span style={{ background: '#3b82f6', color: 'white', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '2px 8px' }}>{totals.totalItems}</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        {view === 'success' && (
          <div style={{ textAlign: 'center', padding: '32px 10px' }}>
            <div style={{ fontSize: 50, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: '#059669', margin: '0 0 7px' }}>{t.orderSuccess}</h3>
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>{t.orderSuccessDesc}</p>
            <button onClick={() => setView('cart')} style={{ marginTop: 16, width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer' }}>
              🛍️ {t.continueShopping}
            </button>
          </div>
        )}

        {view === 'cart' && (cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '44px 10px' }}>
            <div style={{ fontSize: 40, marginBottom: 9, opacity: 0.35 }}>🛒</div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', margin: 0 }}>{t.emptyCart}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>{t.emptyCartDesc}</p>
          </div>
        ) : (
          <div style={{ paddingTop: 7, paddingBottom: 7 }}>
            {cart.map((c, idx) => (
              <CartItemRow key={c.item.id} cartItem={c} isLast={idx === cart.length - 1} onUpdateQty={onUpdateQty} onRemove={onRemove} />
            ))}
          </div>
        ))}

        {view === 'checkout' && (
          <div style={{ paddingTop: 12, paddingBottom: 12 }}>
            <CheckoutForm cart={cart} grossTotal={totals.grossTotal} totalDiscount={totals.totalDiscount} grandTotal={totals.grandTotal} hasOOS={totals.hasOOS} shopUid={shopUid} publicShopId={publicShopId} onSuccess={handleSuccess} t={t} />
          </div>
        )}
      </div>

      {view === 'cart' && cart.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 10, border: '1px solid #e2e8f0' }}>
            {totals.totalDiscount > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginBottom: 2 }}>
                  <span>{t.grossTotal}</span><span>{fmtPrice(totals.grossTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#dc2626', marginBottom: 2 }}>
                  <span>🏷️ {t.discount}</span><span>-{fmtPrice(totals.totalDiscount)}</span>
                </div>
              </>
            )}
            <div style={{ borderTop: '2px solid #334155', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, color: '#16a34a' }}>
              <span>{t.grandTotal}</span><span>{fmtPrice(totals.grandTotal)}</span>
            </div>
          </div>
          <button onClick={() => setView('checkout')} style={{ width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', borderRadius: 10, fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer' }}>
            📝 {t.checkout} - Rs.{fmtAmt(totals.grandTotal)}
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
const MobileCartModal = memo(({ cart, onClose, onUpdateQty, onRemove, onClearCart, shopUid, publicShopId, t }) => {
  const [step, setStep] = useState('cart');
  const totals = useMemo(() => calcTotals(cart), [cart]);
  const handleSuccess = useCallback(() => { onClearCart(); setStep('success'); }, [onClearCart]);

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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 460, maxHeight: '92vh', background: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'ccSlideUp .28s ease', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '13px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {step === 'checkout' && <button onClick={() => setStep('cart')} style={{ background: '#f1f5f9', border: 'none', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>←</button>}
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              {step === 'cart' && `🛒 ${t.cart} (${totals.totalItems})`}
              {step === 'checkout' && `📝 ${t.checkoutTitle}`}
              {step === 'success' && `✅ ${t.orderPlaced}`}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 11 }}>X</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '24px 10px' }}>
              <div style={{ fontSize: 50, marginBottom: 12 }}>🎉</div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: '#059669', margin: '0 0 7px' }}>{t.orderSuccess}</h2>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, margin: '0 0 12px' }}>{t.orderSuccessDesc}</p>
              <button onClick={onClose} style={{ width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', borderRadius: 11, fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                🛍️ {t.continueShopping}
              </button>
            </div>
          )}

          {step === 'cart' && (cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 10px' }}>
              <div style={{ fontSize: 42, marginBottom: 9 }}>🛒</div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>{t.emptyCart}</h3>
              <p style={{ fontSize: 11, color: '#475569' }}>{t.emptyCartDesc}</p>
            </div>
          ) : (
            <>
              {cart.map((c, idx) => (
                <CartItemRow key={c.item.id} cartItem={c} isLast={idx === cart.length - 1} onUpdateQty={onUpdateQty} onRemove={onRemove} />
              ))}
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 12, border: '1px solid #e2e8f0' }}>
                {totals.totalDiscount > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginBottom: 2 }}><span>{t.grossTotal}</span><span>{fmtPrice(totals.grossTotal)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#dc2626', marginBottom: 2 }}><span>🏷️ {t.discount}</span><span>-{fmtPrice(totals.totalDiscount)}</span></div>
                  </>
                )}
                <div style={{ borderTop: '2px solid #334155', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, color: '#16a34a' }}>
                  <span>{t.grandTotal}</span><span>{fmtPrice(totals.grandTotal)}</span>
                </div>
              </div>
              {totals.hasOOS && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 10px', marginTop: 9 }}>
                  <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>{t.oosCartNote}</span>
                </div>
              )}
            </>
          ))}

          {step === 'checkout' && (
            <CheckoutForm cart={cart} grossTotal={totals.grossTotal} totalDiscount={totals.totalDiscount} grandTotal={totals.grandTotal} hasOOS={totals.hasOOS} shopUid={shopUid} publicShopId={publicShopId} onSuccess={handleSuccess} t={t} />
          )}
        </div>

        {step === 'cart' && cart.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <button onClick={() => setStep('checkout')} style={{ width: '100%', padding: '12px 0', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', borderRadius: 12, fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }}>
              📝 {t.checkout} - Rs.{fmtAmt(totals.grandTotal)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
MobileCartModal.displayName = 'MobileCartModal';

/* ═══════════════════════════════════════
   ★ MAIN COMPONENT
═══════════════════════════════════════ */
export default function CustomerCatalog({ shopId: propShopId, lang: propLang = 'si' }) {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();

  // ★ Get logged-in user
  const { user } = useUserAuth();

  // ★ Language
  const [lang, setLang] = useState(propLang);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'si' || saved === 'en') setLang(saved);
    } catch {}
    const h = (e) => { if (e.detail === 'si' || e.detail === 'en') setLang(e.detail); };
    window.addEventListener('app-language-change', h);
    return () => window.removeEventListener('app-language-change', h);
  }, []);
  const t = TEXT[lang] || TEXT.si;

  const embedded = !!propShopId;

  // ★ Priority: propShopId → URL params → logged-in user UID
  const initialShopId = propShopId || params?.shopId || user?.uid || '';
  const [activeShopId, setActiveShopId] = useState(initialShopId);

  const highlightId = searchParams?.get('highlight') || '';

  const [resolvedUid,       setResolvedUid]       = useState('');
  const [shopResolved,      setShopResolved]       = useState(false);
  const [items,             setItems]             = useState([]);
  const [shopInfo,          setShopInfo]          = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [search,            setSearch]            = useState('');
  const [selCat,            setSelCat]            = useState('');
  const [selBrand,          setSelBrand]          = useState('');
  const [sortBy,            setSortBy]            = useState('default');
  const [selItem,           setSelItem]           = useState(null);
  const [showSort,          setShowSort]          = useState(false);
  const [showMobileCart,    setShowMobileCart]    = useState(false);
  const [toastMsg,          setToastMsg]          = useState('');
  const [showToast,         setShowToast]         = useState(false);
  const [cart,              setCart]              = useState([]);
  const [contactItem,       setContactItem]       = useState(null);
  const [shareItem,         setShareItem]         = useState(null);
  const [showShopSelector,  setShowShopSelector]  = useState(false);

  const toastTimer  = useRef(null);
  const unsubRef    = useRef(null);
  const autoOpenRef = useRef('');

  const showToastMessage = useCallback((msg) => {
    setToastMsg(msg);
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 2200);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ★ KEY FIX: Auto-set user's own shop — no selector popup
  useEffect(() => {
    if (!activeShopId && user?.uid) {
      // Logged-in user — use their UID as shop
      setActiveShopId(user.uid);
      setShowShopSelector(false);
    } else if (!activeShopId && !user?.uid) {
      // Not logged in and no shop — show selector
      setShowShopSelector(true);
    } else {
      // Shop already set
      setShowShopSelector(false);
    }
  }, [activeShopId, user?.uid]);

  // ★ Also update when user logs in and activeShopId is empty
  useEffect(() => {
    if (user?.uid && !activeShopId) {
      setActiveShopId(user.uid);
    }
  }, [user?.uid, activeShopId]);

  // Resolve shop UID
  useEffect(() => {
    let cancelled = false;
    if (!activeShopId) {
      setResolvedUid('');
      setShopResolved(true);
      setLoading(false);
      return;
    }
    setShopResolved(false);
    setLoading(true);
    resolvePublicShopToUid(activeShopId).then((uid) => {
      if (!cancelled) {
        setResolvedUid(uid || '');
        setShopResolved(true);
      }
    }).catch(() => {
      if (!cancelled) {
        setResolvedUid('');
        setShopResolved(true);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeShopId]);

  // Load cart from localStorage
  useEffect(() => {
    if (!activeShopId) return;
    try {
      const s = localStorage.getItem(`cart_${activeShopId}`);
      setCart(s ? JSON.parse(s) : []);
    } catch { setCart([]); }
  }, [activeShopId]);

  // Save cart to localStorage
  useEffect(() => {
    if (activeShopId) {
      try { localStorage.setItem(`cart_${activeShopId}`, JSON.stringify(cart)); } catch {}
    }
  }, [cart, activeShopId]);

  // Load items + shop info
  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!activeShopId || !shopResolved) {
      if (!activeShopId) { setLoading(false); setItems([]); setShopInfo(null); }
      return;
    }
    if (!resolvedUid) { setItems([]); setShopInfo(null); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setItems([]);
    setShopInfo(null);

    const q     = query(collection(db, 'items'), where('uid', '==', resolvedUid));
    const unsub = onSnapshot(q, (snap) => {
      if (cancelled) return;
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(data);
      setCart((prev) =>
        prev.map((ci) => {
          const fresh = data.find((d) => d.id === ci.item.id);
          return fresh ? { ...ci, item: fresh, priceInfo: calcPrice(fresh) } : null;
        }).filter(Boolean)
      );
      setLoading(false);
    }, (err) => {
      console.error('items error:', err);
      if (!cancelled) setLoading(false);
    });

    unsubRef.current = unsub;

    const loadShop = async () => {
      try {
        const [userSnap, settingsSnap, genSnap, dirSnap1, dirSnap2] = await Promise.allSettled([
          getDoc(doc(db, 'users', resolvedUid)),
          getDocs(query(collection(db, 'invoice_settings'), where('uid', '==', resolvedUid), limit(1))),
          getDoc(doc(db, 'generalSettings', resolvedUid)),
          getDoc(doc(db, 'shopDirectory', activeShopId)),
          getDoc(doc(db, 'shopDirectory', resolvedUid)),
        ]);
        if (cancelled) return;

        const merged = {};
        const fields = ['shopName', 'businessName', 'companyName', 'phone', 'contactPhone', 'mobile', 'whatsapp', 'address', 'email'];

        [userSnap, settingsSnap, genSnap, dirSnap1, dirSnap2].forEach((res) => {
          if (res.status !== 'fulfilled') return;
          const val = res.value;
          let data  = null;
          if (typeof val.exists === 'function') data = val.exists() ? val.data() : null;
          else if (typeof val.exists === 'boolean') data = val.exists ? val.data() : null;
          else if (val.empty !== undefined) data = val.empty ? null : val.docs[0]?.data();
          if (!data) return;
          fields.forEach((f) => { if (!merged[f] && data[f]) merged[f] = data[f]; });
        });

        if (!cancelled) {
          setShopInfo({
            shopName: merged.shopName || merged.businessName || merged.companyName || '',
            phone:    merged.phone || merged.contactPhone || merged.mobile || '',
            whatsapp: merged.whatsapp || '',
            address:  merged.address || '',
            email:    merged.email   || '',
          });
        }
      } catch (err) { console.warn('loadShop error:', err); }
    };

    loadShop();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [activeShopId, resolvedUid, shopResolved]);

  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  // Auto-open highlighted item
  useEffect(() => {
    if (!highlightId || !items.length) return;
    const key = `${activeShopId}:${highlightId}`;
    if (autoOpenRef.current === key) return;
    const found = items.find((i) => i.id === highlightId);
    if (!found) return;
    autoOpenRef.current = key;
    setSelItem(found);
    setTimeout(() => {
      const el = document.getElementById(`cc-item-${highlightId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [highlightId, items, activeShopId]);

  // Cart operations
  const addToCart = useCallback((item, qty) => {
    setCart((prev) => {
      const existing  = prev.find((c) => c.item.id === item.id);
      const priceInfo = calcPrice(item);
      if (existing) return prev.map((c) => c.item.id === item.id ? { ...c, qty: c.qty + qty, priceInfo } : c);
      return [...prev, { item, qty, priceInfo }];
    });
    showToastMessage(`${item.sinhalaName || item.name} ${t.addedToCart}`);
  }, [showToastMessage, t.addedToCart]);

  const updateCartQty = useCallback((itemId, newQty) => {
    setCart((prev) => prev.map((c) => c.item.id === itemId ? { ...c, qty: Math.max(1, newQty) } : c));
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    if (activeShopId) { try { localStorage.removeItem(`cart_${activeShopId}`); } catch {} }
  }, [activeShopId]);

  const closeSelectedItem = useCallback(() => {
    setSelItem(null);
    if (highlightId && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('highlight');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [highlightId, router]);

  const handleShopSelect = useCallback((newShopId, shopData) => {
    if (newShopId === activeShopId) {
      showToastMessage(`${shopData?.name || ''} — දැනට`);
      return;
    }
    setCart([]);
    setSearch('');
    setSelCat('');
    setSelBrand('');
    setSortBy('default');
    setSelItem(null);
    setActiveShopId(newShopId);
    if (!embedded) router.push(`/pfi/${newShopId}`);
    showToastMessage(`${shopData?.name || ''} ${t.shopSelected}`);
  }, [activeShopId, showToastMessage, embedded, router, t.shopSelected]);

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const cats = useMemo(() => {
    const s = new Set();
    items.forEach((i) => { if (!i.isHidden && !i.isPurchaseOnly && i.categoryName) s.add(i.categoryName); });
    return [...s].sort();
  }, [items]);

  const brands = useMemo(() => {
    const s = new Set();
    items.forEach((i) => { if (!i.isHidden && !i.isPurchaseOnly && i.brandName) s.add(i.brandName); });
    return [...s].sort();
  }, [items]);

  const visible = useMemo(() => {
    let f = items.filter((i) => !i.isHidden && !i.isPurchaseOnly);
    f = smartSearch(f, search);
    if (selCat)   f = f.filter((i) => i.categoryName === selCat);
    if (selBrand) f = f.filter((i) => i.brandName    === selBrand);
    const sorted = [...f];
    switch (sortBy) {
      case 'priceLow':  sorted.sort((a, b) => calcPrice(a).final - calcPrice(b).final); break;
      case 'priceHigh': sorted.sort((a, b) => calcPrice(b).final - calcPrice(a).final); break;
      case 'az':        sorted.sort((a, b) => (a.sinhalaName || a.name || '').localeCompare(b.sinhalaName || b.name || '')); break;
      default:          sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return sorted;
  }, [items, search, selCat, selBrand, sortBy]);

  const totalCount = useMemo(() => items.filter((i) => !i.isHidden && !i.isPurchaseOnly).length, [items]);
  const hasFilters  = !!(search || selCat || selBrand || sortBy !== 'default');
  const clearAll    = useCallback(() => { setSearch(''); setSelCat(''); setSelBrand(''); setSortBy('default'); }, []);

  // Loading state
  if (loading || !shopResolved) {
    return (
      <div id="cc-root" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <GlobalStyles />
        <div style={{ width: 30, height: 30, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'ccSpin 1s linear infinite' }} />
        <p style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>{t.loading}</p>
      </div>
    );
  }

  return (
    <div id="cc-root">
      <GlobalStyles />
      <Toast message={toastMsg} show={showToast} />

      <div className="cc-main">
        {/* HEADER */}
        <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ padding: '10px 12px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>

              {/* ★ Shop selector button — only if not user's own shop */}
              <button
                onClick={() => setShowShopSelector(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#ede9fe,#dbeafe)', border: '2px solid #c4b5fd', borderRadius: 12, padding: '7px 12px', cursor: 'pointer', flexShrink: 0 }}
              >
                <span style={{ fontSize: 20 }}>🏪</span>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  {shopInfo?.shopName ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shopInfo.shopName}</div>
                      <div style={{ fontSize: 9, color: '#7c3aed', fontWeight: 600 }}>🔄 {t.changeShop}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6' }}>
                      {user?.uid === activeShopId ? `🏪 ${t.myShop}` : t.selectShop}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 800 }}>▾</span>
              </button>

              <h1 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap' }}>📦 {t.catalog}</h1>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {cartCount > 0 && (
                <button className="cc-mobile" onClick={() => setShowMobileCart(true)} style={{ position: 'relative', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 9, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  🛒
                  <span style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', color: 'white', borderRadius: '50%', width: 17, height: 17, fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>{cartCount}</span>
                </button>
              )}
              <button
                onClick={() => setShowSort(!showSort)}
                style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, border: 'none', cursor: 'pointer', position: 'relative', background: showSort || hasFilters ? '#eff6ff' : '#f1f5f9', color: showSort || hasFilters ? '#3b82f6' : '#374151' }}
              >
                ⚙️
                {hasFilters && <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid white' }} />}
              </button>
            </div>
          </div>

          <div style={{ padding: '0 12px 7px' }}>
            <input
              type="text"
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 12, color: '#1e293b', background: '#f8fafc', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {cats.length > 0 && (
            <div style={{ padding: '0 12px 8px', display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
              <button onClick={() => setSelCat('')} style={{ flexShrink: 0, padding: '4px 11px', borderRadius: 16, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', background: !selCat ? '#3b82f6' : '#f1f5f9', color: !selCat ? 'white' : '#374151' }}>{t.all}</button>
              {cats.map((c) => (
                <button key={c} onClick={() => setSelCat(selCat === c ? '' : c)} style={{ flexShrink: 0, padding: '4px 11px', borderRadius: 16, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', background: selCat === c ? '#3b82f6' : '#f1f5f9', color: selCat === c ? 'white' : '#374151' }}>{c}</button>
              ))}
            </div>
          )}

          {showSort && (
            <div style={{ padding: '9px 12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {SORT_OPTIONS.map((s) => (
                  <button key={s.key} onClick={() => setSortBy(s.key)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: sortBy === s.key ? 'none' : '1px solid #cbd5e1', cursor: 'pointer', background: sortBy === s.key ? '#3b82f6' : 'white', color: sortBy === s.key ? 'white' : '#374151' }}>{s.label}</button>
                ))}
              </div>
              {brands.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 9, color: '#374151', fontWeight: 700, alignSelf: 'center' }}>{t.brands}:</span>
                  <button onClick={() => setSelBrand('')} style={{ padding: '2px 8px', borderRadius: 8, fontSize: 9, fontWeight: 600, border: !selBrand ? 'none' : '1px solid #cbd5e1', cursor: 'pointer', background: !selBrand ? '#8b5cf6' : 'white', color: !selBrand ? 'white' : '#374151' }}>{t.all}</button>
                  {brands.map((b) => (
                    <button key={b} onClick={() => setSelBrand(selBrand === b ? '' : b)} style={{ padding: '2px 8px', borderRadius: 8, fontSize: 9, fontWeight: 600, border: selBrand === b ? 'none' : '1px solid #cbd5e1', cursor: 'pointer', whiteSpace: 'nowrap', background: selBrand === b ? '#8b5cf6' : 'white', color: selBrand === b ? 'white' : '#374151' }}>{b}</button>
                  ))}
                </div>
              )}
              {hasFilters && (
                <button onClick={clearAll} style={{ width: '100%', padding: '8px 0', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, border: '1px solid #fecaca', cursor: 'pointer' }}>{t.clearAll}</button>
              )}
            </div>
          )}

          <div style={{ padding: '3px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f1f5f9' }}>
            <span style={{ fontSize: 9, color: '#374151', fontWeight: 600 }}>{t.showing} <b>{visible.length}</b> {t.of} {totalCount} {t.found}</span>
            {search && <span style={{ fontSize: 9, color: '#2563eb', background: '#dbeafe', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>"{search}"</span>}
          </div>
        </header>

        {/* GRID */}
        <div className="cc-body">
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 18px', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', margin: 12 }}>
              <div style={{ fontSize: 40, marginBottom: 9 }}>{items.length === 0 ? '🏪' : '🔍'}</div>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                {items.length === 0 ? t.noItemsRegistered : t.noResults}
              </p>
              <p style={{ fontSize: 11, color: '#475569', marginBottom: 12 }}>
                {items.length === 0 ? t.selectShopDesc : t.tryAgain}
              </p>
              <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap' }}>
                {items.length === 0 && (
                  <button onClick={() => setShowShopSelector(true)} style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: 'white', padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>🏪 {t.selectShop}</button>
                )}
                {hasFilters && (
                  <button onClick={clearAll} style={{ background: '#3b82f6', color: 'white', padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>{t.clearSearch}</button>
                )}
              </div>
            </div>
          ) : (
            <div className="cc-grid">
              {visible.map((item) => (
                <div key={item.id} id={`cc-item-${item.id}`}>
                  <Card
                    item={item}
                    onClick={setSelItem}
                    onAddToCart={addToCart}
                    onContactClick={setContactItem}
                    onShareClick={setShareItem}
                    shopId={activeShopId}
                  />
                </div>
              ))}
            </div>
          )}
          <div style={{ height: 18 }} />
        </div>
      </div>

      <DesktopCartSidebar
        cart={cart}
        onUpdateQty={updateCartQty}
        onRemove={removeFromCart}
        onClearCart={clearCart}
        shopUid={resolvedUid}
        publicShopId={activeShopId}
        shopInfo={shopInfo}
        t={t}
      />

      {cartCount > 0 && (
        <button
          className="cc-mobile"
          onClick={() => setShowMobileCart(true)}
          aria-label="cart"
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500, width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(59,130,246,0.5)', animation: 'ccPulse 2s infinite', color: 'white', fontSize: 22 }}
        >
          🛒
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, background: '#ef4444', color: 'white', borderRadius: '50%', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white', padding: '0 2px' }}>{cartCount}</span>
        </button>
      )}

      {showMobileCart && (
        <MobileCartModal
          cart={cart}
          onClose={() => setShowMobileCart(false)}
          onUpdateQty={updateCartQty}
          onRemove={removeFromCart}
          onClearCart={clearCart}
          shopUid={resolvedUid}
          publicShopId={activeShopId}
          t={t}
        />
      )}

      {selItem && (
        <DetailModal
          item={selItem}
          onClose={closeSelectedItem}
          onAddToCart={addToCart}
          onContactClick={(item) => { closeSelectedItem(); setContactItem(item); }}
          onShareClick={setShareItem}
          shopId={activeShopId}
          t={t}
        />
      )}

      {showShopSelector && (
        <ShopSelectorModal
          currentShopId={activeShopId}
          onSelectShop={handleShopSelect}
          onClose={() => setShowShopSelector(false)}
          t={t}
        />
      )}

      {shareItem && (
        <ShareModal
          item={shareItem}
          shopId={activeShopId}
          shopInfo={shopInfo}
          onClose={() => setShareItem(null)}
          onToast={showToastMessage}
          t={t}
        />
      )}

      {contactItem && (
        <ContactPhoneModal
          item={contactItem}
          shopInfo={shopInfo}
          onClose={() => setContactItem(null)}
          t={t}
        />
      )}
    </div>
  );
}
// app/pfi/[shopId]/item/[itemId]/page.jsx
// ★ Server Component — Facebook/WhatsApp/Telegram OG preview with price

import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import CustomerCatalog from '@/components/CustomerCatalog';

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const fmtAmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const calcItemPrice = (item) => {
  if (!item) return { orig: 0, final: 0, discPct: 0, hasDsc: false, unit: '' };

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
  const final = base - discAmt;
  const unit = item.catalogUom || item.uomName || '';

  return {
    orig: base,
    final,
    discPct: disc,
    hasDsc: disc > 0 && discAmt > 0,
    unit,
  };
};

const getItemImage = (item) => {
  if (!item) return '';
  for (const c of [
    item.picture,
    item.imageUrl,
    item.image,
    item.photoURL,
    item.images?.[0],
  ]) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return '';
};

const resolveUid = async (rawShopId) => {
  if (!rawShopId) return '';
  try {
    const userSnap = await getDoc(doc(db, 'users', rawShopId));
    if (userSnap.exists()) return rawShopId;
  } catch {}
  try {
    const dirSnap = await getDoc(doc(db, 'shopDirectory', rawShopId));
    if (dirSnap.exists()) {
      const d = dirSnap.data();
      return d.uid || d.userId || d.ownerUid || rawShopId;
    }
  } catch {}
  return rawShopId;
};

const getShopName = async (uid) => {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      return d.shopName || d.businessName || d.displayName || '';
    }
  } catch {}
  return '';
};

/* ═══════════════════════════════════════
   GENERATE METADATA (Server-side)
═══════════════════════════════════════ */
export async function generateMetadata({ params }) {
  const { shopId, itemId } = params;

  try {
    const uid = await resolveUid(shopId);
    if (!uid) return { title: 'Product Not Found' };

    const itemSnap = await getDoc(doc(db, 'items', itemId));
    if (!itemSnap.exists()) return { title: 'Product Not Found' };

    const item = { id: itemSnap.id, ...itemSnap.data() };
    const price = calcItemPrice(item);
    const image = getItemImage(item);
    const shopName = await getShopName(uid);

    const name = item.sinhalaName || item.name || 'Product';
    const enName = item.name || '';
    const brand = item.brandName || '';
    const unit = price.unit;
    const oos = parseFloat(item.stock || 0) <= 0;

    // ★ Build description with price
    let description = '';

    if (oos) {
      description = `📞 මිල සඳහා අමතන්න | Contact for Price`;
    } else if (price.hasDsc) {
      description = `💰 Rs.${fmtAmt(price.final)}${unit ? ` / ${unit}` : ''} (${price.discPct}% OFF — was Rs.${fmtAmt(price.orig)})`;
    } else {
      description = `💰 Rs.${fmtAmt(price.final)}${unit ? ` / ${unit}` : ''}`;
    }

    if (brand) description += ` | 🏷️ ${brand}`;
    if (shopName) description += ` | 🏪 ${shopName}`;
    if (enName && enName !== name) description += ` | ${enName}`;

    // ★ Title with price
    let title = name;
    if (!oos && price.final > 0) {
      title = `${name} — Rs.${fmtAmt(price.final)}`;
      if (price.hasDsc) title += ` (${price.discPct}% OFF)`;
    }

    const siteUrl = process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app';
    const pageUrl = `${siteUrl}/pfi/${shopId}/item/${itemId}`;

    // ★ OG Image — use item image or generate dynamic OG image
    const ogImage = image || `${siteUrl}/api/og?name=${encodeURIComponent(name)}&price=${encodeURIComponent(fmtAmt(price.final))}&discount=${price.hasDsc ? price.discPct : 0}&shop=${encodeURIComponent(shopName)}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: pageUrl,
        siteName: shopName || 'Weerakkodi POS Catalog',
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: name,
          },
        ],
        type: 'product',
        locale: 'si_LK',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
      },
      other: {
        'product:price:amount': String(price.final),
        'product:price:currency': 'LKR',
        ...(price.hasDsc ? { 'product:original_price:amount': String(price.orig) } : {}),
      },
    };
  } catch (err) {
    console.error('generateMetadata error:', err);
    return {
      title: 'Product',
      description: 'View product details',
    };
  }
}

/* ═══════════════════════════════════════
   PAGE COMPONENT
═══════════════════════════════════════ */
export default function ItemPage({ params }) {
  const { shopId, itemId } = params;

  return (
    <CustomerCatalog
      shopId={shopId}
      highlightItemId={itemId}
    />
  );
}
// catalog/app/pfi/[shopId]/item/[itemId]/page.js
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

function getDb() {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = getApps().length === 0
    ? initializeApp(config)
    : getApps()[0];

  return getFirestore(app);
}

function fmtAmt(v) {
  return (parseFloat(v) || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calcPrice(item) {
  let base = parseFloat(item?.sellingPriceRetail) || 0;
  let disc = parseFloat(item?.retailDiscount) || 0;

  if (item?.catalogPriceType === 'wholesale') {
    base = parseFloat(item?.sellingPriceWholesale) || 0;
    disc = parseFloat(item?.wholesaleDiscount) || 0;
  } else if (item?.catalogPriceType === 'loose') {
    base = parseFloat(item?.sellingPriceLoose) || 0;
    disc = parseFloat(item?.looseDiscount) || 0;
  }

  const discAmt = base * (disc / 100);

  return {
    orig: base,
    final: base - discAmt,
    discPct: disc,
    hasDsc: disc > 0 && discAmt > 0,
  };
}

function getImg(item) {
  if (!item) return null;
  for (const c of [
    item.picture,
    item.imageUrl,
    item.image,
    item.photoURL,
    item.images?.[0],
  ]) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

function isOOS(item) {
  return parseFloat(item?.stock || 0) <= 0;
}

async function getItem(itemId) {
  if (!itemId) return null;
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, 'items', itemId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.warn('getItem error:', e.message);
    return null;
  }
}

async function getShop(shopId) {
  if (!shopId) return null;
  try {
    const db = getDb();
    const snap = await getDoc(doc(db, 'users', shopId));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (e) {
    console.warn('getShop error:', e.message);
    return null;
  }
}

// ★ Social Preview Metadata
export async function generateMetadata({ params }) {
  const { shopId, itemId } = await params;
  const base = process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app';

  const [item, shop] = await Promise.all([
    getItem(itemId),
    getShop(shopId),
  ]);

  if (!item) {
    return {
      title: 'Product Not Found',
      description: 'Item not found',
    };
  }

  const shopName = shop?.shopName || shop?.businessName || shop?.companyName || 'Online Shop';
  const name     = item.sinhalaName || item.name || 'Product';
  const price    = calcPrice(item);
  const unit     = item.catalogUom || item.uomName || '';
  const oos      = isOOS(item);
  const image    = getImg(item);

  const title = `${name} — ${shopName}`;

  const description = oos
    ? `📞 මිල සඳහා අමතන්න | 🏪 ${shopName}`
    : `💰 Rs. ${fmtAmt(price.final)}${unit ? ` / ${unit}` : ''}${price.hasDsc ? ` (${price.discPct}% OFF)` : ''} | 🏪 ${shopName}`;

  const itemUrl    = `${base}/pfi/${shopId}/item/${itemId}`;
  const fallbackOg = `${base}/api/og?shop=${shopId}&item=${itemId}`;

  // ★ Direct product image = fast load = WhatsApp/Facebook preview reliable
  const hasRealImage = image && !image.includes('placehold');

  return {
    title,
    description,
    alternates: {
      canonical: itemUrl,
    },
    openGraph: {
      title,
      description,
      url:  itemUrl,
      type: 'website',
      images: hasRealImage
        ? [
            { url: image,      width: 600,  height: 600, alt: name },
            { url: fallbackOg, width: 1200, height: 630, alt: name },
          ]
        : [
            { url: fallbackOg, width: 1200, height: 630, alt: name },
          ],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      hasRealImage ? [image] : [fallbackOg],
    },
  };
}

// ★ Item Page UI
export default async function ItemPage({ params }) {
  const { shopId, itemId } = await params;

  const [item, shop] = await Promise.all([
    getItem(itemId),
    getShop(shopId),
  ]);

  if (!item) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        padding: 20,
      }}>
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>😕</div>
          <h1 style={{ margin: '0 0 10px', color: '#1e293b' }}>Product Not Found</h1>
          <a
            href={`/pfi/${shopId}`}
            style={{
              display: 'inline-block',
              marginTop: 12,
              padding: '12px 20px',
              background: '#2563eb',
              color: 'white',
              borderRadius: 10,
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            ← Back to Catalog
          </a>
        </div>
      </div>
    );
  }

  const shopName = shop?.shopName || shop?.businessName || shop?.companyName || '';
  const name     = item.sinhalaName || item.name || 'Product';
  const engName  = item.sinhalaName && item.name ? item.name : '';
  const image    = getImg(item);
  const price    = calcPrice(item);
  const oos      = isOOS(item);
  const unit     = item.catalogUom || item.uomName || '';
  const brand    = item.brandName || '';
  const category = item.categoryName || '';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      padding: 20,
    }}>
      <div style={{
        maxWidth: 760,
        margin: '0 auto',
        background: 'white',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
          color: 'white',
          padding: 20,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32 }}>🏪</div>
          <h1 style={{ margin: '8px 0 0', fontSize: 20 }}>
            {shopName || 'Online Shop'}
          </h1>
        </div>

        <div style={{ padding: 20 }}>
          {/* Product image */}
          {image && (
            <img
              src={image}
              alt={name}
              style={{
                width: '100%',
                maxHeight: 340,
                objectFit: 'contain',
                borderRadius: 14,
                background: '#f8fafc',
                marginBottom: 20,
              }}
            />
          )}

          {/* Name */}
          <h2 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: 24 }}>
            {name}
          </h2>

          {engName && (
            <div style={{ color: '#64748b', fontSize: 14, marginBottom: 10 }}>
              {engName}
            </div>
          )}

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {brand && (
              <span style={{
                background: '#f3f0ff',
                color: '#6d28d9',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}>
                🏷️ {brand}
              </span>
            )}
            {category && (
              <span style={{
                background: '#e0f2fe',
                color: '#075985',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}>
                📁 {category}
              </span>
            )}
            {unit && (
              <span style={{
                background: '#f1f5f9',
                color: '#334155',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}>
                📦 {unit}
              </span>
            )}
          </div>

          {/* Price */}
          {!oos ? (
            <div style={{
              background: '#f0fdf4',
              border: '1.5px solid #bbf7d0',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
            }}>
              {price.hasDsc && (
                <div style={{
                  fontSize: 14,
                  color: '#94a3b8',
                  textDecoration: 'line-through',
                  marginBottom: 6,
                }}>
                  Rs. {fmtAmt(price.orig)}
                </div>
              )}
              <div style={{
                fontSize: 32,
                fontWeight: 900,
                color: '#047857',
              }}>
                Rs. {fmtAmt(price.final)}
              </div>
              {price.hasDsc && (
                <div style={{
                  marginTop: 8,
                  display: 'inline-block',
                  background: '#fef2f2',
                  color: '#dc2626',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                }}>
                  -{price.discPct}% OFF
                </div>
              )}
            </div>
          ) : (
            <div style={{
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
              color: '#1e40af',
              fontSize: 18,
              fontWeight: 800,
            }}>
              📞 මිල සඳහා අමතන්න
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div style={{
              color: '#475569',
              lineHeight: 1.6,
              marginBottom: 20,
            }}>
              {item.description}
            </div>
          )}

          {/* CTA */}
          <a
            href={`/pfi/${shopId}?highlight=${itemId}`}
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              background: '#2563eb',
              color: 'white',
              borderRadius: 12,
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            📦 Catalog එකේ බලන්න
          </a>
        </div>
      </div>
    </div>
  );
}
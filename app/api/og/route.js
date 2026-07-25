// catalog/app/api/og/route.js
import { ImageResponse } from 'next/og';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

function getDb() {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
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
    item.picture, item.imageUrl,
    item.image, item.photoURL, item.images?.[0],
  ]) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shop') || '';
    const itemId = searchParams.get('item') || '';

    // ── Shop only ──
    if (shopId && !itemId) {
      let shopName = 'Online Shop';
      try {
        const db = getDb();
        const snap = await getDoc(doc(db, 'users', shopId));
        if (snap.exists()) {
          const d = snap.data();
          shopName = d.shopName || d.businessName || d.companyName || shopName;
        }
      } catch {}

      return new ImageResponse(
        (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,#0f172a,#1e40af)',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
          }}>
            <div style={{ fontSize: 90, display: 'flex' }}>🏪</div>
            <div style={{
              fontSize: 56, fontWeight: 900,
              textAlign: 'center', lineHeight: 1.2,
              marginTop: 20, display: 'flex',
            }}>
              {shopName}
            </div>
            <div style={{
              fontSize: 26, marginTop: 20,
              opacity: 0.85, display: 'flex',
              background: 'rgba(255,255,255,0.15)',
              padding: '12px 36px', borderRadius: 20,
            }}>
              📦 භාණ්ඩ නාමාවලිය
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    // ── Item ──
    if (shopId && itemId) {
      let item = null;
      let shopName = '';

      try {
        const db = getDb();
        const [itemSnap, shopSnap] = await Promise.all([
          getDoc(doc(db, 'items', itemId)),
          getDoc(doc(db, 'users', shopId)),
        ]);
        if (itemSnap.exists()) item = { id: itemSnap.id, ...itemSnap.data() };
        if (shopSnap.exists()) {
          const d = shopSnap.data();
          shopName = d.shopName || d.businessName || d.companyName || '';
        }
      } catch (e) {
        console.warn('Firestore error:', e.message);
      }

      if (!item) {
        return new ImageResponse(
          (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: '#f8fafc', color: '#64748b',
              fontFamily: 'Arial, sans-serif',
            }}>
              <div style={{ fontSize: 80, display: 'flex' }}>📦</div>
              <div style={{ fontSize: 36, marginTop: 16, display: 'flex' }}>
                Product Not Found
              </div>
            </div>
          ),
          { width: 1200, height: 630 }
        );
      }

      const name   = item.sinhalaName || item.name || 'Product';
      const price  = calcPrice(item);
      const imgSrc = getImg(item);
      const unit   = item.catalogUom || item.uomName || '';
      const brand  = item.brandName || '';
      const oos    = parseFloat(item.stock || 0) <= 0;

      return new ImageResponse(
        (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'row',
            background: 'white',
            fontFamily: 'Arial, sans-serif',
          }}>
            {/* ── Left: Image ── */}
            <div style={{
              width: 500, height: 630, flexShrink: 0,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              background: '#f1f5f9',
            }}>
              {imgSrc ? (
                <img
                  src={imgSrc}
                  width={440}
                  height={440}
                  style={{
                    objectFit: 'contain',
                    borderRadius: 16,
                  }}
                />
              ) : (
                <div style={{
                  width: 440, height: 440,
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center',
                  background: '#e2e8f0', borderRadius: 16,
                  fontSize: 120,
                }}>
                  📦
                </div>
              )}
            </div>

            {/* ── Right: Info ── */}
            <div style={{
              flex: 1, display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '40px 48px',
            }}>
              {/* Shop name */}
              {shopName ? (
                <div style={{
                  fontSize: 18, color: '#3b82f6',
                  fontWeight: 700, marginBottom: 12,
                  display: 'flex', alignItems: 'center',
                }}>
                  🏪 {shopName}
                </div>
              ) : (
                <div style={{ display: 'none' }} />
              )}

              {/* Product name */}
              <div style={{
                fontSize: name.length > 30 ? 30 : 38,
                fontWeight: 900, color: '#0f172a',
                lineHeight: 1.25, marginBottom: 16,
                display: 'flex', flexWrap: 'wrap',
              }}>
                {name}
              </div>

              {/* Brand */}
              {brand ? (
                <div style={{
                  fontSize: 16, color: '#6d28d9',
                  background: '#f3f0ff',
                  padding: '6px 14px', borderRadius: 10,
                  fontWeight: 700, marginBottom: 16,
                  display: 'flex', alignItems: 'center',
                }}>
                  🏷️ {brand}
                </div>
              ) : (
                <div style={{ display: 'none' }} />
              )}

              {/* Price */}
              {!oos ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {price.hasDsc ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{
                        fontSize: 22, color: '#94a3b8',
                        textDecoration: 'line-through',
                        display: 'flex',
                      }}>
                        Rs. {fmtAmt(price.orig)}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 8,
                      }}>
                        <div style={{
                          fontSize: 54, fontWeight: 900,
                          color: '#047857', display: 'flex',
                        }}>
                          Rs. {fmtAmt(price.final)}
                        </div>
                        {unit ? (
                          <div style={{
                            fontSize: 18, color: '#64748b',
                            display: 'flex',
                          }}>
                            / {unit}
                          </div>
                        ) : (
                          <div style={{ display: 'none' }} />
                        )}
                      </div>
                      <div style={{
                        fontSize: 18, color: '#dc2626',
                        background: '#fef2f2',
                        padding: '6px 16px', borderRadius: 10,
                        fontWeight: 800, display: 'flex',
                      }}>
                        -{price.discPct}% OFF
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 8,
                    }}>
                      <div style={{
                        fontSize: 54, fontWeight: 900,
                        color: '#047857', display: 'flex',
                      }}>
                        Rs. {fmtAmt(price.orig)}
                      </div>
                      {unit ? (
                        <div style={{
                          fontSize: 18, color: '#64748b', display: 'flex',
                        }}>
                          / {unit}
                        </div>
                      ) : (
                        <div style={{ display: 'none' }} />
                      )}
                    </div>
                  )}

                  {/* Stock badge */}
                  <div style={{
                    marginTop: 8, fontSize: 16, color: '#16a34a',
                    background: '#f0fdf4',
                    padding: '7px 16px', borderRadius: 10,
                    fontWeight: 700, display: 'flex',
                    alignItems: 'center',
                    border: '2px solid #bbf7d0',
                  }}>
                    ✅ Stock ඇත
                  </div>
                </div>
              ) : (
                <div style={{
                  fontSize: 26, color: '#1e40af', fontWeight: 800,
                  background: '#eff6ff',
                  padding: '14px 24px', borderRadius: 12,
                  display: 'flex', alignItems: 'center',
                }}>
                  📞 මිල සඳහා අමතන්න
                </div>
              )}

              {/* CTA */}
              <div style={{
                marginTop: 20, fontSize: 18, color: '#475569',
                background: '#f8fafc',
                padding: '10px 20px', borderRadius: 12,
                display: 'flex', alignItems: 'center',
                border: '2px solid #e2e8f0',
              }}>
                👆 Link tap කර order කරන්න
              </div>
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    // ── Fallback ──
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
          color: 'white', fontFamily: 'Arial, sans-serif',
        }}>
          <div style={{ fontSize: 90, display: 'flex' }}>🏪</div>
          <div style={{
            fontSize: 48, fontWeight: 900,
            marginTop: 20, display: 'flex',
          }}>
            Online Shop
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );

  } catch (err) {
    console.error('OG Error:', err.message);
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#1e40af', color: 'white',
          fontFamily: 'Arial, sans-serif',
        }}>
          <div style={{ fontSize: 80, display: 'flex' }}>🏪</div>
          <div style={{
            fontSize: 40, fontWeight: 900,
            marginTop: 16, display: 'flex',
          }}>
            Online Shop
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
// app/api/og/route.js
// ★ Dynamic OG Image with Price

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name') || 'Product';
  const price = searchParams.get('price') || '0.00';
  const discount = parseInt(searchParams.get('discount') || '0');
  const shop = searchParams.get('shop') || '';

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          fontFamily: 'sans-serif',
          color: 'white',
          padding: '60px',
          position: 'relative',
        }}
      >
        {/* Shop name */}
        {shop && (
          <div
            style={{
              position: 'absolute',
              top: 30,
              left: 40,
              fontSize: 24,
              opacity: 0.85,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            🏪 {shop}
          </div>
        )}

        {/* Discount badge */}
        {discount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 30,
              right: 40,
              background: '#dc2626',
              color: 'white',
              padding: '12px 24px',
              borderRadius: 16,
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            -{discount}% OFF
          </div>
        )}

        {/* Product icon */}
        <div style={{ fontSize: 80, marginBottom: 20 }}>📦</div>

        {/* Product name */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.3,
            marginBottom: 20,
          }}
        >
          {name}
        </div>

        {/* Price */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginTop: 10,
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '16px 40px',
              borderRadius: 20,
              fontSize: 56,
              fontWeight: 900,
              border: '3px solid rgba(255,255,255,0.3)',
            }}
          >
            Rs. {price}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            fontSize: 20,
            opacity: 0.7,
          }}
        >
          Weerakkodi POS Catalog
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
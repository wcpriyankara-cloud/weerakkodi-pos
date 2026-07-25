// catalog/app/api/og-portal/route.js
import { ImageResponse } from 'next/og';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, query,
  where, getDocs, doc, getDoc,
} from 'firebase/firestore';

export const dynamic = 'force-dynamic';

function getDb() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const portalKey = searchParams.get('key') || '';

    let customerName = 'Customer';
    let shopName = 'Online Shop';
    let balance = 0;

    if (portalKey) {
      const db = getDb();

      const custSnap = await getDocs(
        query(collection(db, 'customers'), where('portalAccessKey', '==', portalKey))
      );

      if (!custSnap.empty) {
        const cust = custSnap.docs[0].data();
        customerName = cust.name || 'Customer';
        balance = parseFloat(cust.currentBalance || 0);

        if (cust.uid) {
          const shopSnap = await getDoc(doc(db, 'users', cust.uid));
          if (shopSnap.exists()) {
            const s = shopSnap.data();
            shopName = s.shopName || s.businessName || s.companyName || shopName;
          }
        }
      }
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: 'linear-gradient(135deg,#0f172a,#1e40af)',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
            padding: 60,
          }}
        >
          <div style={{ display: 'flex', fontSize: 80, marginBottom: 16 }}>👤</div>
          <div style={{ display: 'flex', fontSize: 48, fontWeight: 900, lineHeight: 1.2 }}>
            {customerName}
          </div>
          <div style={{ display: 'flex', fontSize: 24, opacity: 0.9, marginTop: 12 }}>
            🏪 {shopName}
          </div>

          {balance > 0 ? (
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                fontSize: 32,
                fontWeight: 800,
                background: 'rgba(220,38,38,0.25)',
                padding: '16px 28px',
                borderRadius: 16,
                border: '2px solid rgba(252,165,165,0.4)',
              }}
            >
              💰 ශේෂය: Rs. {fmtAmt(balance)}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                fontSize: 28,
                fontWeight: 800,
                background: 'rgba(34,197,94,0.2)',
                padding: '14px 24px',
                borderRadius: 16,
                border: '2px solid rgba(134,239,172,0.4)',
              }}
            >
              ✅ ගෙවීම් යාවත්කාලීනයි
            </div>
          )}

          <div
            style={{
              display: 'flex',
              marginTop: 24,
              fontSize: 20,
              opacity: 0.7,
              background: 'rgba(255,255,255,0.1)',
              padding: '10px 20px',
              borderRadius: 12,
            }}
          >
            👆 Portal link එක open කරන්න
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1e40af',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          <div style={{ display: 'flex', fontSize: 80 }}>👤</div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, marginTop: 16 }}>
            Customer Portal
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
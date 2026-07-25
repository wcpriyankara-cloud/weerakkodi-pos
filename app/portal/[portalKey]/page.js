// catalog/app/portal/[portalKey]/page.js
import PortalClient from './PortalClient';

function getDbAdmin() {
  const { initializeApp, getApps } = require('firebase/app');
  const { getFirestore } = require('firebase/firestore');
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

const fmtAmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function getCustomerByKey(portalKey) {
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const db = getDbAdmin();
    const snap = await getDocs(
      query(collection(db, 'customers'), where('portalAccessKey', '==', portalKey))
    );
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) {
    console.warn('getCustomerByKey:', e.message);
    return null;
  }
}

async function getShopByUid(uid) {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const db = getDbAdmin();
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('getShopByUid:', e.message);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { portalKey } = await params;
  const base = process.env.NEXT_PUBLIC_CATALOG_URL || 'https://pos-catalog-gold.vercel.app';

  const customer = await getCustomerByKey(portalKey);

  if (!customer) {
    return {
      title: 'Customer Portal',
      description: 'Customer account portal',
      openGraph: {
        title: 'Customer Portal',
        description: 'Customer account portal',
        images: [{ url: `${base}/api/og-portal?key=${portalKey}`, width: 1200, height: 630 }],
      },
    };
  }

  const shop = customer.uid ? await getShopByUid(customer.uid) : null;
  const shopName = shop?.shopName || shop?.businessName || shop?.companyName || 'Online Shop';
  const name     = customer.name  || 'Customer';
  const balance  = parseFloat(customer.currentBalance || 0);

  const title = `${name} — ${shopName}`;
  const description = balance > 0
    ? `👤 ${name} | 💰 ශේෂය: Rs. ${fmtAmt(balance)} | 🏪 ${shopName}`
    : `👤 ${name} | ✅ ගෙවීම් යාවත්කාලීනයි | 🏪 ${shopName}`;

  const ogUrl    = `${base}/api/og-portal?key=${portalKey}`;
  const pageUrl  = `${base}/portal/${portalKey}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:    pageUrl,
      type:   'website',
      images: [
        {
          url:    ogUrl,
          width:  1200,
          height: 630,
          alt:    title,
        },
      ],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      [ogUrl],
    },
  };
}

export default async function PortalPage({ params }) {
  const { portalKey } = await params;
  return <PortalClient portalKey={portalKey} />;
}
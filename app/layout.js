import './globals.css';
import { UserAuthContextProvider } from '@/context/UserContext';
import SyncButton from '@/components/SyncButton';

/* ═══════════════════════════════════════
   METADATA (server metadata)
═══════════════════════════════════════ */
export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://weerakkodi-pos-app.vercel.app'
  ),

  title: {
    default: 'Weerakkodi POS',
    template: '%s | Weerakkodi POS',
  },
  description: 'POS & Inventory Management System',

  manifest: '/site.webmanifest',

  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Weerakkodi POS',
  },

  other: {
    'mobile-web-app-capable': 'yes',
  },

  openGraph: {
    title: 'Weerakkodi POS',
    description: 'POS & Inventory Management System',
    siteName: 'Weerakkodi POS',
    images: ['/android-chrome-512x512.png'],
    type: 'website',
    locale: 'si_LK',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Weerakkodi POS',
    description: 'POS & Inventory Management System',
    images: ['/android-chrome-512x512.png'],
  },

  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

/* ═══════════════════════════════════════
   VIEWPORT (Next.js 14+ requirement)
═══════════════════════════════════════ */
export const viewport = {
  themeColor: '#1e3a8a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: 'light',
};

export default function RootLayout({ children }) {
  return (
    <html lang="si">
      <body>
        <UserAuthContextProvider>
          {children}
          <SyncButton />
        </UserAuthContextProvider>
      </body>
    </html>
  );
}
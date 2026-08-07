import './globals.css';
import { UserAuthContextProvider } from '@/context/UserContext';

export const metadata = {
  title: 'Weerakkodi POS',
  description: 'POS & Inventory Management System',
  manifest: '/site.webmanifest',
  themeColor: '#1e3a8a',

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

  openGraph: {
    title: 'Weerakkodi POS',
    description: 'POS & Inventory Management System',
    siteName: 'Weerakkodi POS',
    images: ['/android-chrome-512x512.png'],
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="si">
      <body>
        <UserAuthContextProvider>
          {children}
        </UserAuthContextProvider>
      </body>
    </html>
  );
}
import './globals.css';
import { UserAuthContextProvider } from '@/context/UserContext';

export const metadata = {
  title: 'Weerakkodi POS',
  description: 'POS & Inventory Management System',
  manifest: '/site.webmanifest',
  themeColor: '#1e3a8a',

  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
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
    images: ['/web-app-manifest-512x512.png'],
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
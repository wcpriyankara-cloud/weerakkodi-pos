import './globals.css';
import { UserAuthContextProvider } from '@/context/UserContext';

export const metadata = {
  title:       'Weerakkodi POS',
  description: 'POS & Inventory Management System',
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
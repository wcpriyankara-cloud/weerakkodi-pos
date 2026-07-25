import './globals.css';
import { UserAuthContextProvider } from '@/context/UserContext';

export const metadata = {
  title: 'Weerakkodi POS',
  description: 'POS App',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <UserAuthContextProvider>
          {children}
        </UserAuthContextProvider>
      </body>
    </html>
  );
}
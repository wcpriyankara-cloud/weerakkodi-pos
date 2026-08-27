// app/bankloans/page.jsx
import BankLoanManagement from '@/components/BankLoanManagement';

export const metadata = {
  title: 'බැංකු ලෝන් කළමනාකරණය | BizManager',
  description: 'බැංකු ලෝන්, මූල්‍ය ආයතන ණය සහ EMI ගෙවීම් කළමනාකරණය',
};

export default function BankLoansPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 40 }}>
      <BankLoanManagement />
    </div>
  );
}
import BankLoanManagement from '@/components/BankLoanManagement';

export const metadata = {
  title: 'බැංකු ලෝන් සහ සීට්ටු කළමනාකරණය | Weerakkodi POS',
  description: 'බැංකු ලෝන්, මූල්‍ය ආයතන ණය, EMI ගෙවීම් සහ සීට්ටු/සමිති කළමනාකරණය',
};

export default function BankLoansPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 40 }}>
      <BankLoanManagement />
    </div>
  );
}
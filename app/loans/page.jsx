// app/loans/page.jsx
import LoanManagement from '@/components/LoanManagement';

export const metadata = {
  title: 'ණය සහ එකතු කිරීම් කළමනාකරණය | BizManager',
  description: 'බැංකු ලෝන්, මූල්‍ය ආයතන ණය, සහ පාරිභෝගික දෛනික/මාසික ණය එකතු කිරීම් පද්ධතිය',
};

export default function LoansPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 40 }}>
      <LoanManagement />
    </div>
  );
}
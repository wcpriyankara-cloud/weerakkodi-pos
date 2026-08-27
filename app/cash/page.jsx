// app/cash/page.jsx
import CashManagement from '@/components/CashManagement';

export const metadata = {
  title: 'මුදල් සහ බැංකු ලේඛනය | BizManager',
  description: 'මුදල් ලාච්චුව, බැංකු ගිණුම් ශේෂයන් සහ ලාභ විශ්ලේෂණය',
};

export default function CashPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 40 }}>
      <CashManagement />
    </div>
  );
}
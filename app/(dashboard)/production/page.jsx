// app/(dashboard)/production/page.jsx

// ✅ FIXED PATH — @/ alias use කරනවා නම්
import ProductionEntry from '@/components/production/ProductionEntry';

// හෝ relative path:
// import ProductionEntry from '../../../components/production/ProductionEntry';

export const metadata = {
  title: 'Production | POS',
};

export default function ProductionPage() {
  return <ProductionEntry lang="si" />;
}
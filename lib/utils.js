export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

export const normalizeDate = (val) => {
  if (!val) return new Date();
  if (val?.seconds) return new Date(val.seconds * 1000);
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  if (val instanceof Date) return val;
  return new Date();
};

export const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return `Rs. ${num.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

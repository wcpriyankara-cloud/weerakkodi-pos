export const calcNetPrice = (price, discount) => {
  const p = parseFloat(price    || 0);
  const d = parseFloat(discount || 0);
  return (p - (p * d) / 100).toFixed(2);
};

export const formatPrice = (value) =>
  `Rs. ${parseFloat(value || 0).toFixed(2)}`;
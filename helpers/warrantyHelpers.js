export const calcWarrantyExpiry = (period) => {
  if (!period) return '';
  const txt = String(period).toLowerCase().trim();
  if (txt === 'lifetime') return '♾️ ජීවිත කාල';

  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
    const d = new Date(txt);
    return isNaN(d.getTime()) ? '' :
      d.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
  }

  const match = txt.match(
    /^(\d+)\s*(day|days|week|weeks|month|months|year|years|d|w|m|y)s?$/i
  );
  let qty, unit;
  if (!match) {
    qty  = parseInt(txt, 10);
    if (isNaN(qty) || qty <= 0) return '';
    unit = 'm';
  } else {
    qty  = parseInt(match[1], 10);
    unit = match[2].charAt(0).toLowerCase();
  }

  const d = new Date();
  switch (unit) {
    case 'd': d.setDate(d.getDate() + qty);        break;
    case 'w': d.setDate(d.getDate() + qty * 7);    break;
    case 'm': d.setMonth(d.getMonth() + qty);       break;
    case 'y': d.setFullYear(d.getFullYear() + qty); break;
    default:  return '';
  }

  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};
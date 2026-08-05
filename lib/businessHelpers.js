// lib/businessHelpers.js
// Business utility functions — Next.js compatible

/* ═══════════════════════════════════════
   NUMBER / FORMAT HELPERS
═══════════════════════════════════════ */
export const nn = (v) => parseFloat(v) || 0;

export const fmt = (v) =>
  nn(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const todayStr = () => new Date().toISOString().split('T')[0];

export const genBatch   = () => `PRD-${Date.now().toString().slice(-6)}`;
export const genInvoice = () => `INV-${Date.now().toString().slice(-6)}`;

export const partLineNet = (p) => {
  const q  = nn(p.qty);
  const pr = nn(p.sellPrice);
  if (q <= 0 || pr <= 0) return 0;
  const g = q * pr;
  return g - (g * nn(p.discount) / 100);
};

export const partLineGross = (p) => nn(p.qty) * nn(p.sellPrice);

export const getWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
};

export const getMonthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
};

export const tsMs = (ts) => {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds)  return ts.seconds * 1000;
  return 0;
};

export const expLineAmount = (exp) => {
  const q  = nn(exp.qty);
  const up = nn(exp.unitPrice);
  if (q > 0 && up > 0) return q * up;
  return nn(exp.amount);
};

/* ═══════════════════════════════════════
   ITEM / STOCK HELPERS
═══════════════════════════════════════ */
export const DP =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e2e8f0' rx='10'/%3E%3Cpath d='M35 60l10-10 10 10 15-15 10 15' stroke='%2394a3b8' stroke-width='4' fill='none'/%3E%3Ccircle cx='65' cy='40' r='5' fill='%2394a3b8'/%3E%3C/svg%3E";

export const getItemImg = (i) => {
  if (!i) return DP;
  const u = i.picture || i.images?.[0] || i.photoURL || i.imageUrl || '';
  return u?.trim()?.length > 10 ? u.trim() : DP;
};

export const onImgErr = (e) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = DP;
};

export const getSinhala  = (i) => i?.sinhalaName || i?.nameSi || '';
export const getRack     = (i) => i?.rackName || i?.rack || i?.rackNo || i?.location || '';
export const getBaseUnit = (i) => i?.packSize  || i?.uomName || i?.uom || '';

export const getDocStock = (item) => {
  if (!item) return 0;
  if (item.stocks && typeof item.stocks === 'object') {
    const keys = Object.keys(item.stocks);
    if (keys.length > 0) {
      const t = keys.reduce((s, k) => s + (parseFloat(item.stocks[k]) || 0), 0);
      if (t >= 0) return t;
    }
  }
  if (item.currentStock != null && item.currentStock !== '')
    return parseFloat(item.currentStock) || 0;
  if (item.stock != null && item.stock !== '')
    return parseFloat(item.stock) || 0;
  return 0;
};

/* ═══════════════════════════════════════
   PHONE / PORTAL HELPERS
═══════════════════════════════════════ */
export const normalizePhone = (p) => {
  if (!p) return '';
  let s = String(p).replace(/[\s\-\(\)]/g, '');
  if      (s.startsWith('+94'))                    s = '0' + s.slice(3);
  else if (s.startsWith('94') && s.length >= 11)   s = '0' + s.slice(2);
  else if (/^\d{9}$/.test(s))                      s = '0' + s;
  return s;
};

export const displayPhone = (p) => {
  const s = normalizePhone(p);
  if (!s) return '';
  if (s.startsWith('0') && s.length === 10)
    return `${s}  (+94${s.slice(1)})`;
  return s;
};

export const slugify = (s) =>
  String(s || 'biz')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const makePortalKey = (n) =>
  `${slugify(n)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const getPortalLink = (k) => {
  if (!k) return '';
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/portal/${k}`;
};

export const formatPhoneWA = (phone) => {
  if (!phone) return '';
  const c = normalizePhone(phone);
  return c.startsWith('0') ? '94' + c.slice(1) : c;
};

export const hasNativeContacts = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext === true &&
  'contacts' in navigator &&
  'ContactsManager' in window;

export const blobToDataURL = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

/* ═══════════════════════════════════════
   HTML ESCAPE
═══════════════════════════════════════ */
export const esc = (v = '') =>
  String(v)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');

/* ═══════════════════════════════════════
   VCF PARSER
═══════════════════════════════════════ */
export const parseVCF = (txt) => {
  const contacts = [];

  for (const card of txt.split('BEGIN:VCARD').filter((c) => c.trim())) {
    let name = '', phone = '', photo = '';
    const lines = card.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();

      if (l.startsWith('FN:') || l.startsWith('FN;')) {
        name = l.split(':').slice(1).join(':').trim();
      } else if (!name && (l.startsWith('N:') || l.startsWith('N;'))) {
        const p = l.split(':').slice(1).join(':').split(';');
        name = `${(p[1] || '').trim()} ${(p[0] || '').trim()}`.trim();
      }

      if (l.startsWith('TEL') && !phone) {
        phone = l.split(':').slice(1).join(':').trim();
      }

      if (l.startsWith('PHOTO')) {
        let d = '';
        const ci = l.indexOf(':');
        if (ci > -1) d = l.slice(ci + 1);

        let j = i + 1;
        while (
          j < lines.length &&
          (lines[j].startsWith(' ') || lines[j].startsWith('\t'))
        ) {
          d += lines[j].trim();
          j++;
        }
        i = j - 1;

        if (d && !d.startsWith('http')) {
          const m = l.toLowerCase().includes('type=png')
            ? 'image/png'
            : 'image/jpeg';
          photo = d.startsWith('data:') ? d : `data:${m};base64,${d}`;
        }
      }
    }

    if (name || phone) {
      contacts.push({
        name:        name || 'Unknown',
        phone:       normalizePhone(phone),
        photoDataUrl: photo || '',
      });
    }
  }

  return contacts;
};

export const readVCFFile = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = (e) => {
      try {
        res(parseVCF(e.target.result));
      } catch (err) {
        rej(err);
      }
    };
    r.onerror = rej;
    r.readAsText(f);
  });
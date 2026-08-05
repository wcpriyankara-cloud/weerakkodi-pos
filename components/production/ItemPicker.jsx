'use client';

// components/production/ItemPicker.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T } from './translations';
import { getDocStock, getItemImg, getSinhala, getRack, getBaseUnit, onImgErr, fmt, nn } from './utils';
import StockBadge from './StockBadge';

export default function ItemPicker({
  lang,
  value,
  items,
  onChange,
  onItemSelect,
  stockControlEnabled = true,
}) {
  const t = T[lang] || T.si;
  const [open, setOpen] = useState(false);
  const [s,    setS]    = useState(value || '');
  const r = useRef(null);

  useEffect(() => setS(value || ''), [value]);

  useEffect(() => {
    const h = (e) => {
      if (r.current && !r.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    const q = (s || '').toLowerCase().trim();
    if (!q) return items.slice(0, 30);
    return items
      .filter((i) => {
        const x = [i.name, getSinhala(i), i.itemCode, i.barcode, getRack(i)]
          .filter(Boolean).join(' ').toLowerCase();
        return q.split(/\s+/).every((w) => x.includes(w));
      })
      .slice(0, 50);
  }, [items, s]);

  return (
    <div ref={r} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={s}
          onChange={(e) => { setS(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t.searchItem || 'Search...'}
          style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', background: open ? 'white' : '#f8fafc' }}
        />
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
        {s && (
          <button onClick={() => { setS(''); onChange(''); }}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: 10, zIndex: 500, maxHeight: 360, overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', marginTop: 6 }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🔍 {filtered.length}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
          </div>

          {filtered.map((i) => {
            const stock = getDocStock(i);
            const isOut = stock <= 0;
            const op    = parseFloat(i.sellingPriceRetail || i.buyingPrice || i.price || 0);
            const disc  = parseFloat(i.retailDiscount || i.discount || 0);
            const yp    = disc > 0 ? op - (op * disc / 100) : op;

            return (
              <div key={i.id}
                onClick={() => {
                  if (stockControlEnabled && isOut) return;
                  setS(i.name);
                  setOpen(false);
                  onItemSelect?.(i);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: (stockControlEnabled && isOut) ? 'not-allowed' : 'pointer', borderBottom: '1px solid #f1f5f9', opacity: (stockControlEnabled && isOut) ? 0.55 : 1, background: (stockControlEnabled && isOut) ? '#fef2f2' : 'white' }}
                onMouseEnter={(e) => { if (!(stockControlEnabled && isOut)) e.currentTarget.style.background = '#f0f9ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = (stockControlEnabled && isOut) ? '#fef2f2' : 'white'; }}
              >
                <img src={getItemImg(i)} alt="" onError={onImgErr} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.name}
                    {getSinhala(i) && <span style={{ color: '#64748b', fontWeight: 600, marginLeft: 6, fontSize: 12 }}>{getSinhala(i)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    {i.itemCode && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>#{i.itemCode}</span>}
                    {getRack(i)  && <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 700 }}>📍{getRack(i)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, color: '#16a34a', fontSize: 15 }}>Rs.{fmt(yp)}</div>
                  <StockBadge stock={stock} uom={getBaseUnit(i)} />
                </div>
                <span style={{ fontSize: 20, color: isOut ? '#fca5a5' : '#cbd5e1', flexShrink: 0, marginLeft: 4 }}>
                  {isOut ? '⛔' : '＋'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {open && filtered.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #fecaca', borderRadius: 8, zIndex: 500, padding: 16, textAlign: 'center', color: '#dc2626', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4 }}>
          🔍 &quot;{s}&quot; {lang === 'si' ? 'සඳහා ප්‍රතිඵල නැත' : 'not found'}
        </div>
      )}
    </div>
  );
}
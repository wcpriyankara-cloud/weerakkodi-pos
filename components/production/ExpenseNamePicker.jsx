'use client';

// components/production/ExpenseNamePicker.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T } from './translations';
import { S } from './styles';

export default function ExpenseNamePicker({ lang, value, entries, onChange }) {
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

  const sg = useMemo(() => {
    const n = new Set();
    entries.forEach((e) =>
      e.expenseItems?.forEach((x) => { if (x.description) n.add(x.description); })
    );
    return Array.from(n)
      .filter((x) => x.toLowerCase().includes((s || '').toLowerCase()))
      .slice(0, 10);
  }, [entries, s]);

  return (
    <div ref={r} style={{ position: 'relative', flex: 1 }}>
      <input
        value={s}
        onChange={(e) => { setS(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={t.searchExpense || 'Search...'}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}
      />
      {open && sg.length > 0 && (
        <div style={{ ...S.dropdown, zIndex: 300 }}>
          {sg.map((n, i) => (
            <div key={i} onClick={() => { setS(n); onChange(n); setOpen(false); }} style={S.dropItem}>
              💸 {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
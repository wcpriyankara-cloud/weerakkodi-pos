'use client';

// components/production/ContactPickerModal.jsx

import React, { useState, useMemo, memo } from 'react';
import { S } from './styles';
import { displayPhone } from './utils';

const ContactPickerModal = memo(({ contacts, onSelect, onClose }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s)
    );
  }, [contacts, search]);

  return (
    <div style={S.overlay}>
      <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📇</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍" style={{ ...S.inp, marginBottom: 12 }} />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>—</div>
          ) : (
            filtered.map((c, i) => (
              <div key={i} onClick={() => onSelect(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                {c.photoDataUrl ? (
                  <img src={c.photoDataUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3b82f6', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
                    {(c.name || '?')[0]?.toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📱 {displayPhone(c.phone)}</div>}
                </div>
                <span style={{ color: '#3b82f6' }}>➜</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

ContactPickerModal.displayName = 'ContactPickerModal';
export default ContactPickerModal;
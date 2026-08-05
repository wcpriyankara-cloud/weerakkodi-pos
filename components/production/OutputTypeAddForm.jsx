'use client';

// components/production/OutputTypeAddForm.jsx

import React from 'react';
import { S } from './styles';

export default function OutputTypeAddForm({
  t,
  lang,
  icons,
  color,
  newOutputName,
  setNewOutputName,
  newOutputNameEn,
  setNewOutputNameEn,
  newOutputIcon,
  setNewOutputIcon,
  newOutputUnit,
  setNewOutputUnit,
  onAdd,
  onCancel,
  customOutputTypes,
  businessType,
  onDelete,
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: `${color}08`,
        border: `2px solid ${color}40`,
        marginBottom: 16,
      }}
    >
      {/* Title */}
      <div style={{ fontWeight: 800, color, fontSize: 14, marginBottom: 12 }}>
        ➕ {t.addOutput}
      </div>

      {/* Icon Picker */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {icons.map((icon) => (
          <button
            key={icon}
            onClick={() => setNewOutputIcon(icon)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              border:
                newOutputIcon === icon
                  ? `3px solid ${color}`
                  : '2px solid #e2e8f0',
              background: newOutputIcon === icon ? `${color}15` : 'white',
              cursor: 'pointer',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Name Inputs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <input
          value={newOutputName}
          onChange={(e) => setNewOutputName(e.target.value)}
          placeholder={lang === 'si' ? 'සිංහල නම *' : 'Name *'}
          style={{ ...S.inp, fontWeight: 600 }}
          autoFocus
        />
        <input
          value={newOutputNameEn}
          onChange={(e) => setNewOutputNameEn(e.target.value)}
          placeholder="English Name"
          style={S.inp}
        />
      </div>

      {/* Unit Input */}
      <input
        value={newOutputUnit}
        onChange={(e) => setNewOutputUnit(e.target.value)}
        placeholder={
          lang === 'si' ? 'ඒකකය (cube, ton, kg)' : 'Unit (cube, ton, kg)'
        }
        style={{ ...S.inp, marginBottom: 10 }}
      />

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            border: '2px solid #e2e8f0',
            background: 'white',
            color: '#64748b',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          {t.cancel}
        </button>
        <button
          onClick={onAdd}
          disabled={!newOutputName.trim()}
          style={{
            flex: 2,
            padding: 12,
            borderRadius: 10,
            border: 'none',
            background: !newOutputName.trim() ? '#cbd5e1' : color,
            color: 'white',
            cursor: !newOutputName.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 800,
          }}
        >
          ✅ {t.addOutput}
        </button>
      </div>

      {/* Custom Output Types List */}
      {customOutputTypes.filter((c) => c.businessType === businessType).length > 0 && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px dashed ${color}40`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color,
              marginBottom: 8,
            }}
          >
            {t.customOutputs}:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {customOutputTypes
              .filter((c) => c.businessType === businessType)
              .map((co) => (
                <div
                  key={co.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: 'white',
                    border: `1px solid ${color}40`,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {co.icon} {lang === 'si' ? co.labelSi : co.label}
                  <button
                    onClick={() => onDelete(co.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 0,
                      marginLeft: 4,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
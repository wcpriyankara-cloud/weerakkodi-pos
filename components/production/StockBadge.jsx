'use client';

import React from 'react';

export default function StockBadge({ stock, uom }) {
  const s = parseFloat(stock) || 0;
  const isZero = s <= 0;
  const isLow = s > 0 && s <= 5;

  return (
    <span
      style={{
        fontWeight: 'bold',
        padding: '2px 8px',
        borderRadius: 4,
        background: isZero
          ? '#fef2f2'
          : isLow
            ? '#fffbeb'
            : '#f0fdf4',
        color: isZero
          ? '#dc2626'
          : isLow
            ? '#d97706'
            : '#16a34a',
        fontSize: 11,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {isZero ? '🔴' : isLow ? '🟡' : '🟢'}
      {s % 1 === 0 ? s : s.toFixed(2)}
      {uom && uom !== 'unit' ? ` ${uom}` : ''}
    </span>
  );
}
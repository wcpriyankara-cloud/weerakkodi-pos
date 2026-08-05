'use client';

// components/production/FL.jsx

export default function FL({ label, children }) {
  return (
    <div style={{ flex: 1 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#64748b',
          display: 'block',
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
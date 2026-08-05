'use client';

import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  const quickAccess = [
    {
      href: '/pos',
      icon: '🖥️',
      label: 'POS',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg,#3b82f6,#2563eb)',
    },
    {
      href: '/invoice-list',
      icon: '🧾',
      label: 'Invoices',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    },
    {
      href: '/pfi',
      icon: '🛍️',
      label: 'Catalog',
      color: '#ec4899',
      gradient: 'linear-gradient(135deg,#ec4899,#db2777)',
    },
    {
      href: '/production',
      icon: '🏭',
      label: 'Production',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',
      badge: 'NEW',
    },
  ];

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Quick Access */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          Quick Access
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 14,
          }}
        >
          {quickAccess.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                padding: '20px 16px',
                borderRadius: 16,
                border: '2px solid #e2e8f0',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 12px 24px ${item.color}20`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Badge */}
              {item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    fontSize: 9,
                    fontWeight: 900,
                    color: 'white',
                    background: '#16a34a',
                    padding: '2px 7px',
                    borderRadius: 6,
                    letterSpacing: 0.5,
                  }}
                >
                  {item.badge}
                </span>
              )}

              {/* Icon */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: item.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  boxShadow: `0 4px 14px ${item.color}30`,
                }}
              >
                {item.icon}
              </div>

              {/* Label */}
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: '#334155',
                  textAlign: 'center',
                }}
              >
                {item.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
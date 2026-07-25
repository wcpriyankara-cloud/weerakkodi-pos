'use client';

import Link from 'next/link';
import { useUserAuth } from '@/context/UserContext';

export default function HomePage() {
  const { user, loading, logOut, signInWithGoogle } = useUserAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 14,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            border: '4px solid rgba(255,255,255,0.25)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontWeight: 700, color: '#cbd5e1' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 24,
            padding: 32,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏪</div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>
            Weerakkodi POS App
          </h1>
          <p style={{ marginTop: 10, color: '#cbd5e1', fontSize: 16 }}>
            පද්ධතිය භාවිතා කිරීමට පළමුව login කරන්න
          </p>

          <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
            <button
              onClick={signInWithGoogle}
              style={{
                width: '100%',
                padding: '14px 18px',
                borderRadius: 14,
                border: 'none',
                background: 'white',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              🔐 Google Login
            </button>

            <Link
              href="/login"
              style={{
                textDecoration: 'none',
                width: '100%',
                padding: '14px 18px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                fontWeight: 700,
                fontSize: 15,
                display: 'block',
                boxSizing: 'border-box',
              }}
            >
              📧 Email / Password Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 24,
          padding: 32,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏪</div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>
            Weerakkodi POS App
          </h1>
          <p style={{ marginTop: 10, color: '#cbd5e1', fontSize: 16 }}>
            ප්‍රධාන පිටුව
          </p>

          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.08)',
              padding: '10px 16px',
              borderRadius: 14,
            }}
          >
            <span style={{ fontSize: 14 }}>✅</span>
            <span style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>
              {user.email}
            </span>
            <button
              onClick={logOut}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Logout
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <Link
            href="/vehicle-income"
            style={{
              textDecoration: 'none',
              background: 'white',
              color: '#0f172a',
              borderRadius: 18,
              padding: 20,
              fontWeight: 700,
              display: 'block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🚛</div>
            <div style={{ fontSize: 18, marginBottom: 4 }}>Vehicle Income</div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              වාහන ආදායම් කළමනාකරණය
            </div>
          </Link>

          <Link
            href="/pos"
            style={{
              textDecoration: 'none',
              background: 'white',
              color: '#0f172a',
              borderRadius: 18,
              padding: 20,
              fontWeight: 700,
              display: 'block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
            <div style={{ fontSize: 18, marginBottom: 4 }}>POS</div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              POS module
            </div>
          </Link>

          <Link
            href="/invoice-list"
            style={{
              textDecoration: 'none',
              background: 'white',
              color: '#0f172a',
              borderRadius: 18,
              padding: 20,
              fontWeight: 700,
              display: 'block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 18, marginBottom: 4 }}>Invoice List</div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              ඉන්වොයිස් ලැයිස්තුව
            </div>
          </Link>

          <Link
            href="/approved"
            style={{
              textDecoration: 'none',
              background: 'white',
              color: '#0f172a',
              borderRadius: 18,
              padding: 20,
              fontWeight: 700,
              display: 'block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, marginBottom: 4 }}>Approved Orders</div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              අනුමත ඇණවුම්
            </div>
          </Link>

          <Link
            href="/pfi/demo-shop"
            style={{
              textDecoration: 'none',
              background: 'white',
              color: '#0f172a',
              borderRadius: 18,
              padding: 20,
              fontWeight: 700,
              display: 'block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🛍️</div>
            <div style={{ fontSize: 18, marginBottom: 4 }}>Catalog</div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              Product catalog
            </div>
          </Link>

          {/* ✅ NEW — Customers card */}
          <Link
            href="/customers"
            style={{
              textDecoration: 'none',
              background: 'white',
              color: '#0f172a',
              borderRadius: 18,
              padding: 20,
              fontWeight: 700,
              display: 'block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 18, marginBottom: 4 }}>Customers</div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              පාරිභෝගිකයින් කළමනාකරණය
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
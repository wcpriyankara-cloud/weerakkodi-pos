'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';

export default function RootPage() {
  const { user, loading, signInWithGoogle } = useUserAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a, #1e3a8a)',
        color: 'white',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 44, height: 44,
            border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{ fontWeight: 700, color: '#cbd5e1' }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
      color: 'white',
      fontFamily: '-apple-system, Arial, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '0 20px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 24,
          padding: '40px 32px',
          backdropFilter: 'blur(12px)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🏪</div>
          <h1 style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.5px',
          }}>
            Weerakkodi POS
          </h1>
          <p style={{
            marginTop: 10,
            color: '#cbd5e1',
            fontSize: 15,
          }}>
            පද්ධතිය භාවිත කිරීමට Login කරන්න
          </p>

          <div style={{
            height: 1,
            background: 'rgba(255,255,255,0.1)',
            margin: '24px 0',
          }} />

          <button
            onClick={signInWithGoogle}
            style={{
              width: '100%',
              padding: '15px 18px',
              borderRadius: 14,
              border: 'none',
              background: 'white',
              color: '#0f172a',
              fontWeight: 800,
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>🔐</span>
            Google සමඟ Login කරන්න
          </button>
        </div>
      </div>
    </div>
  );
}
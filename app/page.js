'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '../context/UserContext';

export default function LoginPage() {
  const { user, loading, loginWithEmail, signInWithGoogle } = useUserAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!loading && user) {
      router.replace('/pos');
    }
  }, [user, loading, mounted, router]);

  // ✅ Email/Password Login — result check කරනවා
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    try {
      const result = await loginWithEmail(email, password);
      if (result.success) {
        router.replace('/pos');
      } else {
        setError(result.error || 'Login අසාර්ථකයි');
      }
    } catch (err) {
      setError(err.message || 'Login අසාර්ථකයි');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ✅ Google Sign-In Handler
  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        router.replace('/pos');
      } else {
        setError(result.error || 'Google Login අසාර්ථකයි');
      }
    } catch (err) {
      setError(err.message || 'Google Login අසාර්ථකයි');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // ✅ Offline Login
  const handleOfflineLogin = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('weerakkodi_offline_user', JSON.stringify({
        uid: 'offline_user',
        email: 'offline@weerakkodi.lk',
        displayName: 'Offline User'
      }));
      router.push('/pos');
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">⏳ පූරණය වෙමින්...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">🔄 POS පිටුව වෙත යොමු වෙමින්...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">🏪 Weerakkodi POS</h1>
          <p className="text-blue-200">පාරිභෝගික සේවා පද්ධතිය</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-200 text-sm text-center">
            ⚠️ {error}
          </div>
        )}

        {/* ===== ✅ Google Sign-In Button (ප්‍රධාන) ===== */}
        <button
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading || isLoggingIn}
          className="w-full flex items-center justify-center gap-3
                     py-3.5 rounded-lg font-semibold text-base
                     bg-white text-gray-800
                     hover:bg-gray-100 hover:shadow-lg
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 mb-2"
        >
          <svg width="22" height="22" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {isGoogleLoading ? '⏳ සම්බන්ධ වෙමින්...' : 'Google සමඟ පිවිසෙන්න'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 my-5">
          <div className="flex-1 h-px bg-white/20"></div>
          <span className="text-blue-300/60 text-xs">හෝ</span>
          <div className="flex-1 h-px bg-white/20"></div>
        </div>

        {/* ===== Email/Password Form ===== */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-blue-200 text-sm block mb-1">📧 Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-blue-400"
              placeholder="email@example.com"
              required
              disabled={isGoogleLoading || isLoggingIn}
            />
          </div>
          <div>
            <label className="text-blue-200 text-sm block mb-1">🔒 Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-blue-400"
              placeholder="••••••••"
              required
              disabled={isGoogleLoading || isLoggingIn}
            />
          </div>
          <button
            type="submit"
            disabled={isLoggingIn || isGoogleLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-lg transition-colors"
          >
            {isLoggingIn ? '⏳ පිවිසෙමින්...' : '🔐 Email මඟින් පිවිසෙන්න'}
          </button>
        </form>

        {/* ===== Offline Button ===== */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <button
            onClick={handleOfflineLogin}
            disabled={isGoogleLoading || isLoggingIn}
            className="w-full py-3 bg-amber-600/80 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            📡 Offline ප්‍රකාරයෙන් පිවිසෙන්න
          </button>
        </div>

        <p className="text-blue-300/40 text-xs text-center mt-5">
          Google ගිනුමක් තෝරා ආරක්ෂිතව පිවිසෙන්න
        </p>
      </div>
    </div>
  );
}
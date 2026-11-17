'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import { auth, db } from '@/lib/firebase';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,      // ← Electron fallback සඳහා
  getRedirectResult,       // ← Electron fallback සඳහා
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { localDb } from '@/lib/localDb';

const UserAuthContext = createContext(null);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/* ══ CACHE ══ */
const USER_CACHE_KEY = 'user_data_cache';

const saveUserCache = (uid, data) => {
  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ uid, data, ts: Date.now() }));
  } catch {}
};

const loadUserCache = (uid) => {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.uid !== uid) return null;
    if (Date.now() - parsed.ts > 5 * 60 * 1000) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const clearUserCache = () => {
  try { sessionStorage.removeItem(USER_CACHE_KEY); } catch {}
};

const normalizeUser = (firebaseUser) => {
  if (!firebaseUser) return null;
  return {
    uid:           firebaseUser.uid,
    displayName:   firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
    email:         firebaseUser.email       || '',
    photoURL:      firebaseUser.photoURL    || '',
    phoneNumber:   firebaseUser.phoneNumber || '',
    emailVerified: !!firebaseUser.emailVerified,
  };
};

/* ══ CRITICAL: Dexie Cleanup on User Switch/Logout ══ */
const cleanupUserDexieData = async (uid) => {
  if (!uid) return;
  try {
    await Promise.all([
      localDb.items.where('uid').equals(uid).delete(),
      localDb.customers.where('uid').equals(uid).delete(),
      localDb.invoices.where('uid').equals(uid).delete(),
      // ✅ අලුතින් එකතු කළා — loans සහ cash transactions ද මකන්න
      localDb.customerLoans.where('uid').equals(uid).delete(),
      localDb.cashTransactions.where('uid').equals(uid).delete(),
    ]);
    console.log(`[Auth] ✅ Cleaned ALL Dexie data for uid=${uid}`);
  } catch (e) {
    console.warn('[Auth] Dexie cleanup failed:', e);
  }
};

/* ══ Firebase error → සිංහල පණිවිඩ ══ */
const friendlyError = (err) => {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email හෝ මුරපදය වැරදියි.';
    case 'auth/invalid-email':
      return 'Email ලිපිනය වලංගු නැත.';
    case 'auth/too-many-requests':
      return 'උත්සාහ කිරීම් වැඩියි. මද වේලාවකින් නැවත උත්සාහ කරන්න.';
    case 'auth/network-request-failed':
      return 'අන්තර්ජාල සම්බන්ධතාවය පරීක්ෂා කරන්න.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login කවුළුව වසා දමන ලදී.';
    case 'auth/popup-blocked':
      return 'Popup කවුළුව අවහිර වී ඇත. Browser settings පරීක්ෂා කරන්න.';
    case 'auth/unauthorized-domain':
      return 'මෙම domain එක Firebase Console → Authentication → Settings → Authorized domains වලට එකතු කරන්න.';
    default:
      return err?.message || 'Login දෝෂයක් හටගත්තා.';
  }
};

/* ══ PROVIDER ══ */
export function UserAuthContextProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const prevUidRef              = useRef(null);

  // Background (non-blocking) profile load
  const loadUserData = useCallback(async (firebaseUser) => {
    if (!firebaseUser?.uid) return null;

    const cached = loadUserCache(firebaseUser.uid);
    if (cached) {
      setUserData(cached);
      return cached;
    }

    let timer;
    try {
      const fetchPromise = getDoc(doc(db, 'users', firebaseUser.uid));
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {}, 30000);
      });

      const snap = await Promise.race([fetchPromise, timeoutPromise]);
      if (snap && snap.exists()) {
        const data = snap.data();
        setUserData(data);
        saveUserCache(firebaseUser.uid, data);
        return data;
      }
    } catch (e) {
      console.warn('loadUserData offline fallback:', e.message);
    } finally {
      clearTimeout(timer);
    }
    return null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isMounted = true;

    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1000);

    // ✅ Auth state listener — SINGLE SOURCE OF TRUTH
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) return;

      if (firebaseUser) {
        const norm = normalizeUser(firebaseUser);
        const oldUid = prevUidRef.current;
        const newUid = norm.uid;

        // ✅ Detect user switch
        if (oldUid && oldUid !== newUid) {
          console.warn(`[Auth] User switch detected: ${oldUid} → ${newUid}`);
          clearUserCache();
          cleanupUserDexieData(oldUid).catch(() => {});
          setUserData(null);
        }

        prevUidRef.current = newUid;
        setUser(norm);
        localDb.settings.put({ id: 'current_user', ...norm }).catch(() => {});
        loadUserData(firebaseUser);
      } else {
        // ✅ CRITICAL: Firebase says no user → ALWAYS clear
        const oldUid = prevUidRef.current;
        if (oldUid) {
          cleanupUserDexieData(oldUid).catch(() => {});
        }
        prevUidRef.current = null;

        setUser(null);
        setUserData(null);
        clearUserCache();
        localDb.settings.delete('current_user').catch(() => {});
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsub();
      clearTimeout(safetyTimer);
    };
  }, [loadUserData]);

  // Email / Password Login
  const loginWithEmail = useCallback(async (email, password) => {
    try {
      const cleanEmail = (email || '').trim();

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const res  = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const norm = normalizeUser(res.user);

        const oldUid = prevUidRef.current;
        if (oldUid && oldUid !== norm.uid) {
          clearUserCache();
          cleanupUserDexieData(oldUid).catch(() => {});
        }
        prevUidRef.current = norm.uid;

        setUser(norm);
        setUserData(null);
        await localDb.settings.put({ id: 'current_user', ...norm });
        loadUserData(res.user);
        return { success: true, user: norm };
      }

      // Offline fallback
      const localUser = await localDb.settings.get('current_user');
      if (localUser && localUser.uid && localUser.email === cleanEmail) {
        setUser(localUser);
        return { success: true, user: localUser };
      }
      return {
        success: false,
        error: 'Offline අවස්ථාවේදී Login විය හැක්කේ කලින් Login වූ ගිණුමෙන් පමණි.',
      };
    } catch (err) {
      return { success: false, error: friendlyError(err) };
    }
  }, [loadUserData]);

  // ✅ Google Login (popup + redirect fallback)
  const signInWithGoogle = useCallback(async () => {
    try {
      let result;
      try {
        // පළමුව popup උත්සාහ කරන්න
        result = await signInWithPopup(auth, googleProvider);
      } catch (popupErr) {
        // Electron / popup-blocked නම් redirect fallback
        if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/operation-not-supported-in-this-environment') {
          console.warn('[Auth] Popup blocked, trying redirect...');
          await signInWithRedirect(auth, googleProvider);
          return { success: false, error: 'Redirect වෙමින්...' };
        }
        throw popupErr;
      }

      const firebaseUser = result.user;
      const norm         = normalizeUser(firebaseUser);

      // ✅ Clean up old user if switching
      const oldUid = prevUidRef.current;
      if (oldUid && oldUid !== norm.uid) {
        clearUserCache();
        cleanupUserDexieData(oldUid).catch(() => {});
      }
      prevUidRef.current = norm.uid;

      setUser(norm);
      setUserData(null);
      clearUserCache();
      await localDb.settings.put({ id: 'current_user', ...norm });

      // Firestore වල user profile save කරන්න
      setDoc(doc(db, 'users', firebaseUser.uid), {
        uid:         norm.uid,
        displayName: norm.displayName,
        email:       norm.email,
        photoURL:    norm.photoURL,
        lastLogin:   serverTimestamp(),
      }, { merge: true }).catch(() => {});

      loadUserData(firebaseUser);
      return { success: true, user: norm };
    } catch (err) {
      return { success: false, error: friendlyError(err) };
    }
  }, [loadUserData]);

  // Logout
  const logOut = useCallback(async () => {
    const oldUid = prevUidRef.current;
    prevUidRef.current = null;
    setUser(null);
    setUserData(null);
    clearUserCache();

    try {
      await localDb.settings.delete('current_user').catch(() => {});
      if (oldUid) {
        await cleanupUserDexieData(oldUid).catch(() => {});
      }
      await signOut(auth).catch(() => {});
    } catch (e) {
      console.warn('Logout cleanup error:', e);
    }
  }, []);

  const value = useMemo(() => ({
    user,
    userData,
    loading,
    loginWithEmail,
    signInWithGoogle,
    logOut,
  }), [user, userData, loading, loginWithEmail, signInWithGoogle, logOut]);

  return (
    <UserAuthContext.Provider value={value}>
      {children}
    </UserAuthContext.Provider>
  );
}

export function useUserAuth() {
  const ctx = useContext(UserAuthContext);
  if (!ctx) {
    console.error('UserAuthContextProvider is missing in layout.js');
    return {
      user: null,
      userData: null,
      loading: false,
      loginWithEmail:   async () => ({ success: false, error: 'Context unmounted' }),
      signInWithGoogle: async () => ({ success: false, error: 'Context unmounted' }),
      logOut: async () => {},
    };
  }
  return ctx;
}

export default UserAuthContextProvider;
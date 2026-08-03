'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';

import { auth, db } from '@/lib/firebase';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

const UserAuthContext = createContext(null);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/* ══ CACHE ══ */
const USER_CACHE_KEY = 'user_data_cache';
const USER_CACHE_TTL = 10 * 60 * 1000;

const saveUserCache = (uid, data) => {
  try {
    sessionStorage.setItem(
      USER_CACHE_KEY,
      JSON.stringify({ uid, data, ts: Date.now() })
    );
  } catch {}
};

const loadUserCache = (uid) => {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.uid !== uid) return null;
    if (Date.now() - parsed.ts > USER_CACHE_TTL) return null;
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
    displayName:   firebaseUser.displayName  || '',
    email:         firebaseUser.email        || '',
    photoURL:      firebaseUser.photoURL     || '',
    phoneNumber:   firebaseUser.phoneNumber  || '',
    emailVerified: !!firebaseUser.emailVerified,
  };
};

/* ══ PROVIDER ══ */
export function UserAuthContextProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading]   = useState(true);

  const loadUserData = useCallback(async (firebaseUser) => {
    if (!firebaseUser?.uid) return null;

    const cached = loadUserCache(firebaseUser.uid);
    if (cached) {
      setUserData(cached);
      return cached;
    }

    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        saveUserCache(firebaseUser.uid, data);
        return data;
      }
      return null;
    } catch (e) {
      if (e.code === 'unavailable' || e.code === 'resource-exhausted') {
        const fallback = loadUserCache(firebaseUser.uid);
        if (fallback) {
          setUserData(fallback);
          return fallback;
        }
      }
      console.warn('loadUserData error:', e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(normalizeUser(firebaseUser));
      if (firebaseUser) {
        await loadUserData(firebaseUser);
      } else {
        setUserData(null);
        clearUserCache();
      }
      setLoading(false);
    });
    return () => unsub();
  }, [loadUserData]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result       = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const userRef      = doc(db, 'users', firebaseUser.uid);

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid:           firebaseUser.uid,
            displayName:   firebaseUser.displayName  || '',
            email:         firebaseUser.email        || '',
            photoURL:      firebaseUser.photoURL     || '',
            phone:         firebaseUser.phoneNumber  || '',
            emailVerified: firebaseUser.emailVerified,
            authProvider:  'google',
            role:          'owner',
            status:        'active',
            businessName:  '',
            address:       '',
            createdAt:     serverTimestamp(),
            lastLogin:     serverTimestamp(),
            updatedAt:     serverTimestamp(),
          }, { merge: true });
        } else {
          await setDoc(userRef, {
            lastLogin:     serverTimestamp(),
            updatedAt:     serverTimestamp(),
            emailVerified: firebaseUser.emailVerified,
          }, { merge: true });
        }
      } catch (writeErr) {
        console.warn('User doc write error:', writeErr.message);
      }

      clearUserCache();
      await loadUserData(firebaseUser);
      setUser(normalizeUser(firebaseUser));
      return { success: true, user: normalizeUser(firebaseUser) };
    } catch (err) {
      console.error('Google sign in error:', err);
      return { success: false, error: err.message };
    }
  }, [loadUserData]);

  const logOut = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserData(null);
      clearUserCache();
      try {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (
            key?.startsWith('customers_') ||
            key?.startsWith('invoices_')  ||
            key === USER_CACHE_KEY
          ) keysToRemove.push(key);
        }
        keysToRemove.forEach((k) => sessionStorage.removeItem(k));
      } catch {}
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, []);

  const resendEmailVerification = useCallback(async () => {
    try {
      if (!auth.currentUser) return { success: false };
      await sendEmailVerification(auth.currentUser);
      return { success: true, message: '📧 Verification email sent!' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, []);

  const refreshUserStatus = useCallback(async () => {
    try {
      if (!auth.currentUser) return { success: false };
      await reload(auth.currentUser);
      const refreshed = auth.currentUser;
      setUser(normalizeUser(refreshed));
      if (refreshed?.uid) {
        await setDoc(doc(db, 'users', refreshed.uid), {
          emailVerified: refreshed.emailVerified,
          updatedAt:     serverTimestamp(),
        }, { merge: true });
        clearUserCache();
        await loadUserData(refreshed);
      }
      return { success: true, verified: refreshed.emailVerified };
    } catch (e) {
      return { success: false };
    }
  }, [loadUserData]);

  const value = useMemo(() => ({
    user,
    userData,
    loading,
    signInWithGoogle,
    logOut,
    resendEmailVerification,
    refreshUserStatus,
  }), [
    user, userData, loading,
    signInWithGoogle, logOut,
    resendEmailVerification, refreshUserStatus,
  ]);

  return (
    <UserAuthContext.Provider value={value}>
      {children}
    </UserAuthContext.Provider>
  );
}

export function useUserAuth() {
  const ctx = useContext(UserAuthContext);
  if (!ctx) throw new Error('useUserAuth must be inside UserAuthContextProvider');
  return ctx;
}

export default UserAuthContextProvider;
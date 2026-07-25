'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
} from '@/shared/firebase-config';
import {
  onAuthStateChanged,
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

export function UserAuthContextProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (firebaseUser) => {
    if (!firebaseUser?.uid) return null;
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        return data;
      }
      return null;
    } catch (e) {
      console.warn('loadUserData error:', e);
      return null;
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadUserData(firebaseUser);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [loadUserData]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;

      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(
          userRef,
          {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || '',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
            phone: firebaseUser.phoneNumber || '',
            emailVerified: firebaseUser.emailVerified,
            authProvider: 'google',
            role: 'owner',
            status: 'active',
            businessName: '',
            address: '',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        await setDoc(
          userRef,
          {
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp(),
            emailVerified: firebaseUser.emailVerified,
          },
          { merge: true }
        );
      }

      await loadUserData(firebaseUser);
      return { success: true, user: firebaseUser };
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
      console.warn('resendEmailVerification error:', e);
      return { success: false, error: e.message };
    }
  }, []);

  const refreshUserStatus = useCallback(async () => {
    try {
      if (!auth.currentUser) return { success: false };
      await reload(auth.currentUser);
      const refreshed = auth.currentUser;
      setUser({ ...refreshed });

      if (refreshed.uid) {
        await setDoc(
          doc(db, 'users', refreshed.uid),
          {
            emailVerified: refreshed.emailVerified,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      return { success: true, verified: refreshed.emailVerified };
    } catch (e) {
      console.warn('refreshUserStatus error:', e);
      return { success: false };
    }
  }, []);

  const value = {
    user,
    userData,
    loading,
    signInWithGoogle,
    logOut,
    resendEmailVerification,
    refreshUserStatus,
  };

  return (
    <UserAuthContext.Provider value={value}>
      {children}
    </UserAuthContext.Provider>
  );
}

export function useUserAuth() {
  const ctx = useContext(UserAuthContext);
  if (!ctx) {
    throw new Error('useUserAuth must be used inside UserAuthContextProvider');
  }
  return ctx;
}
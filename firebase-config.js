import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  enableNetwork,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.warn('Firebase env vars missing:', missingKeys.join(', '));
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const globalFirebase = globalThis;

// Firestore
let db = globalFirebase.__weerakkodi_db__;

if (!db) {
  try {
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch {
    db = getFirestore(app);
  }
  globalFirebase.__weerakkodi_db__ = db;
}

if (
  typeof window !== 'undefined' &&
  !globalFirebase.__weerakkodi_db_network_enabled__
) {
  enableNetwork(db).catch((e) =>
    console.warn('Firestore enableNetwork warning:', e)
  );
  globalFirebase.__weerakkodi_db_network_enabled__ = true;
}

// Auth
const auth = globalFirebase.__weerakkodi_auth__ || getAuth(app);
globalFirebase.__weerakkodi_auth__ = auth;

if (
  typeof window !== 'undefined' &&
  !globalFirebase.__weerakkodi_auth_language_set__
) {
  auth.useDeviceLanguage();
  globalFirebase.__weerakkodi_auth_language_set__ = true;
}

// Storage
const storage = globalFirebase.__weerakkodi_storage__ || getStorage(app);
globalFirebase.__weerakkodi_storage__ = storage;

// Google Provider
const googleProvider =
  globalFirebase.__weerakkodi_google_provider__ ||
  new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});

globalFirebase.__weerakkodi_google_provider__ = googleProvider;

export {
  app,
  db,
  auth,
  storage,
  googleProvider,
  firebaseConfig,
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
};

export default app;
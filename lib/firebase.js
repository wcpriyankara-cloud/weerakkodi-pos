import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence } from "firebase/auth";
import { 
  initializeFirestore, 
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  disableNetwork,
  enableNetwork,
  setLogLevel
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAB-Qgy1xIKe29B1OMRFMYxKkVF9EwrqIs",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "weerakkodi-pos.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "weerakkodi-pos",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "weerakkodi-pos.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "109876543210",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:109876543210:web:abcdef1234567890",
};

setLogLevel("silent");

// 1. Singleton Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 2. Singleton Firestore Instance (Long-polling enabled for Electron)
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}

// Named Exports
export const db = firestoreDb;
export const firestore = firestoreDb;

export const auth = getAuth(app);
if (typeof window !== "undefined") {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {});
}

export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export function getDb() {
  return firestoreDb || getFirestore(app);
}

// Attach properties to db to prevent any import confusion
if (firestoreDb && typeof firestoreDb === 'object') {
  firestoreDb.db = firestoreDb;
  firestoreDb.app = app;
  firestoreDb.auth = auth;
  firestoreDb.storage = storage;
}

// ✅ Default export is always the Firestore DB instance
export default firestoreDb;
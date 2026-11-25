// firebase-config.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  getFirestore 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 1. App එක Singleton ලෙස Initialize කිරීම
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 2. Firestore Initialize කිරීම (Electron / WebChannel 400 Bad Request දෝෂය වැළැක්වීම සඳහා)
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true, // 👈 මෙමගින් /Listen/channel 400 Bad Request දෝෂය සම්පූර්ණයෙන්ම විසඳේ
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const storage = getStorage(app);

export default { app, db, auth, storage, firebaseConfig };
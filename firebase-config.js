import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  disableNetwork,
  enableNetwork,
  terminate,
  setLogLevel,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  indexedDBLocalPersistence,
} from "firebase/auth";
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

// =============================================
// SUPPRESS ALL NETWORK ERROR NOISE
// =============================================
if (typeof window !== "undefined") {
  const origErr = console.error;
  console.error = function (...args) {
    const msg = args.map((a) => String(a)).join(" ");
    if (
      msg.includes("resource-exhausted") ||
      msg.includes("Quota exceeded") ||
      msg.includes("maximum backoff") ||
      msg.includes("ERR_INTERNET_DISCONNECTED") ||
      msg.includes("ERR_NETWORK_CHANGED") ||
      msg.includes("ERR_NAME_NOT_RESOLVED") ||
      msg.includes("ERR_CONNECTION_CLOSED") ||
      msg.includes("ERR_NETWORK_IO_SUSPENDED") ||
      msg.includes("ERR_CONNECTION_REFUSED") ||
      msg.includes("ERR_TIMED_OUT") ||
      msg.includes("ERR_FAILED") ||
      msg.includes("ERR_ABORTED") ||
      msg.includes("cleardot.gif") ||
      msg.includes("Failed to get document") ||
      msg.includes("Could not reach Cloud Firestore") ||
      msg.includes("offline") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("firestore.googleapis.com") ||
      msg.includes("firebasestorage.googleapis.com") ||
      msg.includes("securetoken.googleapis.com") ||
      msg.includes("identitytoolkit.googleapis.com")
    )
      return;
    return origErr.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = function (...args) {
    const msg = args.map((a) => String(a)).join(" ");
    if (
      msg.includes("ERR_") ||
      msg.includes("cleardot") ||
      msg.includes("Failed to get") ||
      msg.includes("offline") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("Persistence") ||
      msg.includes("Could not reach") ||
      msg.includes("firestore.googleapis.com") ||
      msg.includes("firebasestorage.googleapis.com")
    )
      return;
    return origWarn.apply(console, args);
  };

  // Suppress unhandled promise rejections from Firebase network failures
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String(e.reason);
    if (
      msg.includes("ERR_") ||
      msg.includes("offline") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("Could not reach") ||
      msg.includes("Failed to get") ||
      msg.includes("firestore.googleapis.com") ||
      msg.includes("Network error")
    ) {
      e.preventDefault();
    }
  });
}

// =============================================
// FIREBASE INIT
// =============================================
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const auth = getAuth(app);
if (typeof window !== "undefined") {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {});
}

const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// =============================================
// AUTO OFFLINE / ONLINE DETECTION
// =============================================
let _isOfflineMode = false;

export const isOffline = () => _isOfflineMode;

export const goOfflineMode = async () => {
  if (_isOfflineMode) return;
  _isOfflineMode = true;
  console.log("[Firebase] 🔌 Offline mode — local cache only");
  try {
    await disableNetwork(db);
  } catch (e) {
    // If disableNetwork fails, try terminate (nuclear option)
    try {
      await terminate(db);
      console.log("[Firebase] 🔌 Firestore terminated (offline)");
    } catch (e2) {
      // ignore
    }
  }
};

export const goOnlineMode = async () => {
  if (!_isOfflineMode) return;
  _isOfflineMode = false;
  console.log("[Firebase] 🌐 Online mode — syncing...");
  try {
    await enableNetwork(db);
  } catch (e) {
    // If enableNetwork fails (because we terminated), re-initialize
    try {
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        useFetchStreams: false,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      console.log("[Firebase] 🌐 Firestore re-initialized");
    } catch (e2) {
      // ignore
    }
  }
};

if (typeof window !== "undefined") {
  // Initial check
  if (!navigator.onLine) {
    goOfflineMode();
  }

  // Auto-detect network changes
  window.addEventListener("offline", () => {
    goOfflineMode();
  });

  window.addEventListener("online", () => {
    goOnlineMode();
  });

  // Listen for Electron main process network status (more reliable than navigator.onLine)
  if (window.electronAPI && window.electronAPI.onNetworkStatus) {
    window.electronAPI.onNetworkStatus((online) => {
      if (online) {
        goOnlineMode();
      } else {
        goOfflineMode();
      }
    });
  }
}

export { app, db, auth, storage, googleProvider };
export default app;
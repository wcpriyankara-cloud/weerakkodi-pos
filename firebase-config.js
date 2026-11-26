import { 
  app, 
  db, 
  firestore, 
  auth, 
  storage, 
  googleProvider, 
  getDb, 
  firebaseConfig 
} from "./lib/firebase";
import { disableNetwork, enableNetwork } from "firebase/firestore";

// Auto Offline / Online Detection for Electron
let _isOfflineMode = false;
export const isOffline = () => _isOfflineMode;

export const goOfflineMode = async () => {
  if (_isOfflineMode) return;
  _isOfflineMode = true;
  try {
    if (db) await disableNetwork(db);
  } catch (e) {}
};

export const goOnlineMode = async () => {
  if (!_isOfflineMode) return;
  _isOfflineMode = false;
  try {
    if (db) await enableNetwork(db);
  } catch (e) {}
};

if (typeof window !== "undefined") {
  if (!navigator.onLine) {
    goOfflineMode();
  }

  window.addEventListener("offline", () => goOfflineMode());
  window.addEventListener("online", () => goOnlineMode());

  if (window.electronAPI && window.electronAPI.onNetworkStatus) {
    window.electronAPI.onNetworkStatus((online) => {
      if (online) goOnlineMode();
      else goOfflineMode();
    });
  }
}

export {
  app,
  db,
  firestore,
  auth,
  storage,
  googleProvider,
  getDb,
  firebaseConfig
};

// ✅ Default export is guaranteed to be Firestore DB
export default db;
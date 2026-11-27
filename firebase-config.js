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

let _isOfflineMode = false;
export const isOffline = () => _isOfflineMode;

export const goOfflineMode = async () => {
  if (_isOfflineMode) return;
  _isOfflineMode = true;
  try {
    const fdb = db || getDb();
    if (fdb) await disableNetwork(fdb);
  } catch (e) {}
};

export const goOnlineMode = async () => {
  if (!_isOfflineMode) return;
  _isOfflineMode = false;
  try {
    const fdb = db || getDb();
    if (fdb) await enableNetwork(fdb);
  } catch (e) {}
};

if (typeof window !== "undefined") {
  if (!navigator.onLine) {
    goOfflineMode();
  }
  window.addEventListener("offline", () => goOfflineMode());
  window.addEventListener("online", () => goOnlineMode());
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

export default db;
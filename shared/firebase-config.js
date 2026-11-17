// Clean unified shared Firebase configuration & helpers
import { 
  app, 
  auth, 
  db, 
  storage, 
  googleProvider, 
  firebaseConfig 
} from '../firebase-config';

export {
  app,
  auth,
  db,
  storage,
  googleProvider,
  firebaseConfig
};

// Re-export standard Auth helpers directly from firebase/auth without duplicates
export {
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';

export default db;

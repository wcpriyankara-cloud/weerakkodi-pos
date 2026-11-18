// clean_firebase.js
const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning and standardizing Firebase configurations...');

// 1. Base clean template for firebaseConfig / shared configs
const cleanFirebaseConfig = `// Clean unified Firebase configuration & helpers
import { 
  app, 
  auth, 
  db, 
  storage, 
  googleProvider, 
  firebaseConfig 
} from './firebase-config';

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
`;

const cleanSharedFirebaseConfig = `// Clean unified shared Firebase configuration & helpers
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
`;

// Update firebaseConfig.js
['firebaseConfig.js', 'src/firebaseConfig.js'].forEach(relPath => {
  const filePath = path.join(__dirname, relPath);
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, cleanFirebaseConfig, 'utf8');
    console.log('✅ Standardized:', relPath);
  }
});

// Update shared/firebase-config.js
['shared/firebase-config.js', 'src/shared/firebase-config.js'].forEach(relPath => {
  const filePath = path.join(__dirname, relPath);
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, cleanSharedFirebaseConfig, 'utf8');
    console.log('✅ Standardized:', relPath);
  }
});

// Clean the base firebase-config.js from any appended duplicate re-exports
['firebase-config.js', 'src/firebase-config.js'].forEach(relPath => {
  const filePath = path.join(__dirname, relPath);
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Strip duplicate auth export blocks if appended previously
  code = code.replace(/\/\/ Re-export standard auth helpers[\s\S]*?from 'firebase\/auth';/g, '');
  fs.writeFileSync(filePath, code.trim() + '\n', 'utf8');
  console.log('✅ Cleaned base:', relPath);
});

console.log('🎉 Firebase configuration cleanup complete!');
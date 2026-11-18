// fix-uids.js — Firestore වල uid නැති items වලට uid එකතු කරයි
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const TARGET_UID = 'your_firebase_uid_here'; // ← ඔබගේ Firebase UID

async function fixUids() {
  const collections = ['items', 'customers', 'invoices'];

  for (const col of collections) {
    // uid නැති documents සොයන්න
    const snapshot = await db.collection(col)
      .where('uid', '==', null)
      .get()
      .catch(() => null);

    if (!snapshot) {
      console.log(`⚠️ ${col}: Cannot query null uid, trying missing field...`);
      // Alternative: get ALL docs and filter
      const allDocs = await db.collection(col).get();
      const batch = db.batch();
      let count = 0;

      allDocs.docs.forEach(doc => {
        const data = doc.data();
        if (!data.uid || data.uid === null || data.uid === undefined) {
          batch.update(doc.ref, { uid: TARGET_UID });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        console.log(`✅ ${col}: Added uid to ${count} documents`);
      } else {
        console.log(`✅ ${col}: All documents already have uid`);
      }
      continue;
    }

    if (snapshot.empty) {
      console.log(`✅ ${col}: No documents missing uid`);
      continue;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { uid: TARGET_UID });
    });
    await batch.commit();
    console.log(`✅ ${col}: Added uid to ${snapshot.size} documents`);
  }

  console.log('🎉 UID fix complete!');
}

fixUids().catch(console.error);
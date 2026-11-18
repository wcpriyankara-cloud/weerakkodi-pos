const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const MY_UID = 'wlknSmbTOEbcxp527cqGBnc3yu93';

async function fix() {
  console.log('🔧 Starting Firestore uid fix...\n');
  for (const col of ['items', 'suppliers', 'purchases', 'customers', 'invoices']) {
    try {
      const snap = await db.collection(col).get();
      if (snap.empty) {
        console.log(`⏭️  ${col}: empty collection`);
        continue;
      }
      const batch = db.batch();
      let count = 0;
      snap.docs.forEach(d => {
        if (!d.data().uid) {
          batch.update(d.ref, { uid: MY_UID });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
        console.log(`✅ ${col}: ${count} docs fixed with uid`);
      } else {
        console.log(`✅ ${col}: all ${snap.size} docs already have uid`);
      }
    } catch (e) {
      console.log(`⚠️  ${col}: ${e.message}`);
    }
  }
  console.log('\n🎉 Done!');
}
fix().catch(console.error);
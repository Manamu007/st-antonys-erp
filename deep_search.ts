import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function deepSearch() {
  await initializationPromise;
  const db = getDbAdmin();

  const collections = await db.listCollections();
  console.log(`Checking ${collections.length} collections for 'demostudentrazerpay' and 'student_1786081827075'...`);

  for (const col of collections) {
    try {
      const snap = await col.get();
      snap.docs.forEach(doc => {
        const str = (doc.id + ' ' + JSON.stringify(doc.data())).toLowerCase();
        if (str.includes('demostudentrazerpay') || str.includes('1786081827075') || str.includes('demostudentrazorpay')) {
          console.log(`\n[Collection: ${col.id}] Doc ID: ${doc.id}`);
          console.log(JSON.stringify(doc.data(), null, 2));
        }
      });
    } catch (e) {
      // skip collection if error
    }
  }

  process.exit(0);
}

deepSearch().catch(console.error);

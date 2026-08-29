import { initializationPromise, dbAdmin } from '../src/server/firebaseAdmin.js';

async function runDirectAdminSearch() {
  await initializationPromise;
  console.log('Firebase Admin initialized. Searching collections...');

  const collections = ['staff', 'users', 'leaves', 'timetables', 'batches', 'audit_logs', 'attendance'];
  const keywords = ['anil', 'babu', 'balaiah', 'balayya', 'nageswar', 'nagesh', '8074572283'];

  for (const collName of collections) {
    try {
      const snap = await dbAdmin.collection(collName).get();
      console.log(`\nCollection '${collName}' has ${snap.size} documents.`);
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        const str = JSON.stringify({ id: doc.id, ...data }).toLowerCase();
        for (const kw of keywords) {
          if (str.includes(kw)) {
            console.log(`>>> MATCH in [${collName}] for "${kw}" (doc ID: ${doc.id}):`);
            console.log(JSON.stringify({ id: doc.id, ...data }, null, 2));
            break;
          }
        }
      });
    } catch (e: any) {
      console.log(`Error checking ${collName}:`, e.message);
    }
  }

  process.exit(0);
}

runDirectAdminSearch().catch(console.error);

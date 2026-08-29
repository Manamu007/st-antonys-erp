import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  const settingsSnap = await db.collection('settings').get();
  console.log('--- Settings ---');
  settingsSnap.docs.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}

run().catch(console.error);

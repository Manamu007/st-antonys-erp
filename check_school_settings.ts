import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function check() {
  await initializationPromise;
  const db = getDbAdmin();
  const snap = await db.collection('settings').doc('school').get();
  if (snap.exists) {
    console.log('School Settings:', JSON.stringify(snap.data(), null, 2));
  } else {
    console.log('Settings document not found!');
  }
  process.exit(0);
}
check();

import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const usersSnap = await db.collection('users').limit(10).get();
  console.log(`Users count in default limit 10: ${usersSnap.size}`);
  usersSnap.docs.forEach(doc => {
    console.log(`User Doc: ${doc.id} | data:`, JSON.stringify(doc.data()));
  });

  const studentsSnap = await db.collection('students').limit(10).get();
  console.log(`Students count in default limit 10: ${studentsSnap.size}`);

  const staffSnap = await db.collection('staff').limit(10).get();
  console.log(`Staff count in default limit 10: ${staffSnap.size}`);

  process.exit(0);
}

run().catch(console.error);

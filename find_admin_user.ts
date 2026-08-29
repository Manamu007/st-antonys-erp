import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const email = "manamunagaraju@gmail.com";
  console.log(`Searching 'users' for email: ${email}`);
  const snap = await db.collection('users').where('email', '==', email).get();
  console.log(`Total matching users: ${snap.size}`);
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Document ID: ${doc.id}`);
    console.log(`Properties:`, {
      uid: data.uid,
      id: data.id,
      email: data.email,
      role: data.role,
      name: data.name,
      status: data.status,
      hasFacePhoto: !!data.facePhotoUrl,
    });
  });

  process.exit(0);
}

run().catch(console.error);


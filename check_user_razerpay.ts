import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  console.log("Searching and printing users where email is demostudentrazerpay@gmail.com...");
  const usersQuery = await db.collection('users').where('email', '==', 'demostudentrazerpay@gmail.com').get();
  console.log(`Found ${usersQuery.size} docs in 'users':`);
  usersQuery.docs.forEach(doc => {
    console.log(`- ID: ${doc.id}, data:`, doc.data());
  });

  console.log("Searching and printing students where email is demostudentrazerpay@gmail.com...");
  const studentsQuery = await db.collection('students').where('email', '==', 'demostudentrazerpay@gmail.com').get();
  console.log(`Found ${studentsQuery.size} docs in 'students':`);
  studentsQuery.docs.forEach(doc => {
    console.log(`- ID: ${doc.id}, data:`, doc.data());
  });
}

run().catch(console.error);

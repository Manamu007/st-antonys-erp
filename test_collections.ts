import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  
  // 1. Check if 'students' collection exists and has records
  const studentsSnap = await db.collection('students').limit(5).get();
  console.log("'students' collection documents count:", studentsSnap.size);
  studentsSnap.docs.forEach(doc => {
    console.log(`- students Doc: ${doc.id}, name: ${doc.data().name}`);
  });

  // 2. Check if user ahammad has any document in 'students' collection
  const ahammadStudentDoc = await db.collection('students').doc('ahammad_s_91944111').get();
  console.log("ahammad_s_91944111 in 'students':", ahammadStudentDoc.exists ? ahammadStudentDoc.data() : "NOT EXISTS");

  // 3. Check if user ahammad has any document in 'users' collection
  const ahammadUserDoc = await db.collection('users').doc('ahammad_s_91944111').get();
  console.log("ahammad_s_91944111 in 'users':", ahammadUserDoc.exists ? ahammadUserDoc.data() : "NOT EXISTS");
}

run().catch(console.error);

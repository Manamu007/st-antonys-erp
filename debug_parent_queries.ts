import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';
import { getSmartBotResponse } from './src/server/aiBotService.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  // Let's find some parents and students
  console.log("--- SCANNING FOR SOME PARENTS IN 'users' or 'students' ---");
  const usersSnap = await db.collection('users').limit(15).get();
  console.log(`Found ${usersSnap.size} users:`);
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`User ID: ${doc.id} | Name: ${data.name} | Role: ${data.role} | Phone: ${data.phone || data.whatsappNumber || data.parentPhone}`);
  });

  const studentsSnap = await db.collection('students').limit(5).get();
  console.log(`Found ${studentsSnap.size} students:`);
  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Student ID: ${doc.id}`);
    console.log(JSON.stringify(data, null, 2));
  });

  process.exit(0);
}

run().catch(console.error);

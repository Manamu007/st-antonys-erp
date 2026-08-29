import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const queryNum = "9440989858";
  console.log(`Searching for info containing: ${queryNum}`);

  // Check users collection
  console.log("\n--- Searching 'users' collection ---");
  const usersSnap = await db.collection('users').get();
  let usersCount = 0;
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data);
    if (str.includes(queryNum)) {
      usersCount++;
      console.log(`User ID: ${doc.id} contains ${queryNum}:`);
      console.log(JSON.stringify(data, null, 2));
    }
  });
  console.log(`Checked ${usersSnap.size} users. Found ${usersCount} matches.`);

  // Check students collection
  console.log("\n--- Searching 'students' collection ---");
  const studentsSnap = await db.collection('students').get();
  let studentsCount = 0;
  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data);
    if (str.includes(queryNum) || str.includes("9440989858") || (data.phone && data.phone.includes(queryNum)) || (data.contact && String(data.contact).includes(queryNum)) || (data.whatsappNumber && String(data.whatsappNumber).includes(queryNum)) || (data.parentPhone && String(data.parentPhone).includes(queryNum))) {
      studentsCount++;
      console.log(`Student ID: ${doc.id} contains matches:`);
      console.log(JSON.stringify(data, null, 2));
    }
  });
  console.log(`Checked ${studentsSnap.size} students. Found ${studentsCount} matches.`);

  process.exit(0);
}

run().catch(console.error);

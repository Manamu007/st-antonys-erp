import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  
  console.log("Searching in 'students' collection...");
  const studentsSnap = await db.collection('students').get();
  console.log(`Found ${studentsSnap.size} students in 'students' collection.`);
  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.name?.toLowerCase().includes('kadapa') || data.name?.toLowerCase().includes('vyshnavi') || data.name?.toLowerCase().includes('venki')) {
      console.log(`\n- STU Doc ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Father Name: ${data.fatherName}`);
      console.log(`  Parent Phone: ${data.parentPhone}`);
      console.log(`  Whatsapp: ${data.whatsappNumber}`);
      console.log(`  Contact last10: ${data.contact_last10}`);
      console.log(`  Parent last10: ${data.parent_last10}`);
    }
  });

  console.log("\nSearching in 'users' collection...");
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} users. Searching for candidates...`);
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.name?.toLowerCase().includes('kadapa') || data.name?.toLowerCase().includes('vyshnavi') || data.name?.toLowerCase().includes('venki')) {
      console.log(`\n- USR Doc ID: ${doc.id}`);
      console.log(`  Role: ${data.role}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Father Name: ${data.fatherName}`);
      console.log(`  Parent Phone: ${data.parentPhone}`);
      console.log(`  Whatsapp: ${data.whatsappNumber}`);
      console.log(`  Contact last10: ${data.contact_last10}`);
      console.log(`  Parent last10: ${data.parent_last10}`);
    }
  });
}

run().catch(console.error);

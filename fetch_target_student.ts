import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function fetchDetails() {
  await initializationPromise;
  const db = getDbAdmin();

  const ids = ['student_1786081827075', 'stud_1780567054942'];
  console.log("Fetching student records for:", ids);

  for (const id of ids) {
    const doc = await db.collection('students').doc(id).get();
    if (doc.exists) {
      console.log(`\n================ Found student doc by ID: ${id} ================`);
      console.log(JSON.stringify(doc.data(), null, 2));
    } else {
      console.log(`\n--- Student doc with ID ${id} not found by direct doc(id). Checking where uid == '${id}' or studentId == '${id}'...`);
      const q1 = await db.collection('students').where('uid', '==', id).get();
      console.log(`where uid == ${id}: found ${q1.size}`);
      q1.docs.forEach(d => console.log(JSON.stringify(d.data(), null, 2)));

      const q2 = await db.collection('students').where('uniqueStudentId', '==', id).get();
      console.log(`where uniqueStudentId == ${id}: found ${q2.size}`);
      q2.docs.forEach(d => console.log(JSON.stringify(d.data(), null, 2)));
    }
  }

  // Also search fees / student_fees collection for these student IDs or demostudent
  console.log("\nSearching fees for student_1786081827075 / demostudentrazerpay...");
  const feesSnap = await db.collection('fees').get();
  console.log(`Total fees docs: ${feesSnap.size}`);
  feesSnap.docs.forEach(d => {
    const str = (d.id + ' ' + JSON.stringify(d.data())).toLowerCase();
    if (str.includes('1786081827075') || str.includes('1780567054942') || str.includes('demostudent') || str.includes('razerpay') || str.includes('razorpay')) {
      console.log(`\n[fees] ID: ${d.id}`);
      console.log(JSON.stringify(d.data(), null, 2));
    }
  });

  process.exit(0);
}

fetchDetails().catch(console.error);

import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const queries = ["demostudentrazerpay", "demostudent", "razerpay", "razorpay", "demo"];
  console.log(`Searching students for:`, queries);

  const collections = ['students', 'users', 'admissions', 'parents'];
  for (const col of collections) {
    console.log(`\n================ Searching Collection: ${col} ================`);
    const snap = await db.collection(col).get();
    console.log(`Total records in ${col}: ${snap.size}`);
    
    let matches = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const id = doc.id;
      const content = (id + ' ' + JSON.stringify(data)).toLowerCase();

      // Check for exact substring matches
      for (const q of queries) {
        if (content.includes(q)) {
          matches++;
          console.log(`\n>>> [MATCH in ${col}] ID: ${id} (matched '${q}')`);
          console.log(`Name: ${data.name || data.firstName || data.fullName || 'N/A'}`);
          console.log(`Email: ${data.email || data.parentEmail || 'N/A'}`);
          console.log(`Roll: ${data.rollNumber || data.rollNo || 'N/A'}`);
          console.log(`Admission No: ${data.admissionNumber || 'N/A'}`);
          console.log(`Class: ${data.class || data.classId || 'N/A'}`);
          console.log(`Batch: ${data.batch || data.batchId || 'N/A'}`);
          console.log(`Phone: ${data.phone || data.contact || data.whatsappNumber || 'N/A'}`);
          console.log(`Raw Data:\n`, JSON.stringify(data, null, 2));
          break;
        }
      }
    }
    console.log(`Finished ${col}. Matches found: ${matches}`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

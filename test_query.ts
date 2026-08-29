import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  // Let's query students with batchId = LKG_SectionA
  const snap = await db.collection('students').where('batchId', '==', 'LKG_SectionA').get();
  console.log(`Found ${snap.size} students with batchId == LKG_SectionA`);

  snap.docs.forEach(doc => {
    const s = doc.data();
    console.log(s.name, s.academicYear, s.status);
  });
}

run().catch(console.error);

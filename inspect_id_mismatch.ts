import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  // 1. Get all classes docs from DB
  const classesSnap = await db.collection('classes').get();
  console.log('--- CLASSES COLLECTION ---');
  classesSnap.docs.forEach(doc => {
    console.log(`Doc ID: ${doc.id} | name: ${doc.data().name}`);
  });

  // 2. Get all batches docs from DB
  const batchesSnap = await db.collection('batches').get();
  console.log('\n--- BATCHES COLLECTION ---');
  batchesSnap.docs.forEach(doc => {
    console.log(`Doc ID: ${doc.id} | name: ${doc.data().name} | classId: ${doc.data().classId}`);
  });

  // 3. Get distinct classIds and batchIds used in students collection
  const studentsSnap = await db.collection('students').get();
  const studentClassIds = new Set();
  const studentBatchIds = new Set();
  studentsSnap.docs.forEach(doc => {
    const s = doc.data();
    if (s.classId) studentClassIds.add(s.classId);
    if (s.batchId) studentBatchIds.add(s.batchId);
  });

  console.log('\n--- DISTINCT CLASS/BATCH IDS USED IN STUDENTS ---');
  console.log('Class IDs:', Array.from(studentClassIds));
  console.log('Batch IDs:', Array.from(studentBatchIds));
}

run().catch(console.error);

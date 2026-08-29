import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  // Let's count students in each class and batch
  const studentsSnap = await db.collection('students').get();
  const classCounts: Record<string, number> = {};
  const batchCounts: Record<string, number> = {};

  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    const classId = data.classId || 'undefined';
    const batchId = data.batchId || 'undefined';

    classCounts[classId] = (classCounts[classId] || 0) + 1;
    batchCounts[batchId] = (batchCounts[batchId] || 0) + 1;
  });

  console.log('--- Student counts by class ---');
  console.log(classCounts);

  console.log('--- Student counts by batch ---');
  console.log(batchCounts);
}

run().catch(console.error);

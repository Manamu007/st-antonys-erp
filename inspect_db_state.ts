import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  // 1. Get Nirmala's profile
  const email = 'nirmalapyreddy85@gmail.com';
  const staffSnap = await db.collection('staff').where('email', '==', email).get();
  console.log('--- Staff Profile ---');
  staffSnap.docs.forEach(doc => {
    console.log(doc.id, doc.data());
  });

  const userSnap = await db.collection('users').where('email', '==', email).get();
  console.log('--- User Profile ---');
  userSnap.docs.forEach(doc => {
    console.log(doc.id, doc.data());
  });

  // 2. Get all classes
  const classesSnap = await db.collection('classes').get();
  console.log('--- Classes ---');
  classesSnap.docs.forEach(doc => {
    console.log(doc.id, doc.data().name);
  });

  // 3. Get all batches
  const batchesSnap = await db.collection('batches').get();
  console.log('--- Batches ---');
  batchesSnap.docs.forEach(doc => {
    console.log(doc.id, doc.data().name, 'classId:', doc.data().classId);
  });

  // 4. Sample a few students
  const studentsSnap = await db.collection('students').limit(10).get();
  console.log('--- Sample Students ---');
  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(doc.id, data.name, 'classId:', data.classId, 'batchId:', data.batchId, 'academicYear:', data.academicYear);
  });
}

run().catch(console.error);

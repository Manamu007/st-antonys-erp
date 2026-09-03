import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';
import fs from 'fs';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection");
    process.exit(1);
  }

  const results: any = {
    studentsFound: [],
    usersFound: [],
    paymentsFound: [],
    admissionsFound: [],
    allCollectionsList: []
  };

  // List all collections
  const colls = await db.listCollections();
  results.allCollectionsList = colls.map(c => c.id);

  // Check students
  const studentsSnap = await db.collection('students').get();
  studentsSnap.docs.forEach(doc => {
    const d = doc.data();
    const str = (doc.id + ' ' + JSON.stringify(d)).toLowerCase();
    if (
      str.includes('demo') ||
      str.includes('razer') ||
      str.includes('razor') ||
      str.includes('test')
    ) {
      const sanitized = { ...d };
      delete sanitized.photoURL;
      delete sanitized.faceDescriptor;
      results.studentsFound.push({ id: doc.id, data: sanitized });
    }
  });

  // Check users
  const usersSnap = await db.collection('users').get();
  usersSnap.docs.forEach(doc => {
    const d = doc.data();
    const str = (doc.id + ' ' + JSON.stringify(d)).toLowerCase();
    if (
      str.includes('demo') ||
      str.includes('razer') ||
      str.includes('razor') ||
      str.includes('test')
    ) {
      const sanitized = { ...d };
      delete sanitized.photoURL;
      delete sanitized.faceDescriptor;
      results.usersFound.push({ id: doc.id, data: sanitized });
    }
  });

  // Check payments
  if (results.allCollectionsList.includes('payments')) {
    const paySnap = await db.collection('payments').get();
    paySnap.docs.forEach(doc => {
      const d = doc.data();
      const str = (doc.id + ' ' + JSON.stringify(d)).toLowerCase();
      if (str.includes('demo') || str.includes('razer') || str.includes('razor')) {
        results.paymentsFound.push({ id: doc.id, data: d });
      }
    });
  }

  // Check admissions
  if (results.allCollectionsList.includes('admissions')) {
    const admSnap = await db.collection('admissions').get();
    admSnap.docs.forEach(doc => {
      const d = doc.data();
      const str = (doc.id + ' ' + JSON.stringify(d)).toLowerCase();
      if (str.includes('demo') || str.includes('razer') || str.includes('razor')) {
        results.admissionsFound.push({ id: doc.id, data: d });
      }
    });
  }

  fs.writeFileSync('./search_results.json', JSON.stringify(results, null, 2));
  console.log("Successfully wrote search_results.json!");
  console.log(`Found ${results.studentsFound.length} students, ${results.usersFound.length} users, ${results.paymentsFound.length} payments`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

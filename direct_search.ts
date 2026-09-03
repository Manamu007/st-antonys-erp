import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

async function search() {
  const app = admin.initializeApp({
    projectId: firebaseConfig.projectId,
  }, 'search-app-' + Date.now());

  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  console.log("Connected to Firestore db:", firebaseConfig.firestoreDatabaseId);

  console.log("Fetching students...");
  const snap = await db.collection('students').get();
  console.log(`Fetched ${snap.size} students.`);

  let studentMatches = 0;
  snap.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const str = (id + ' ' + JSON.stringify(data)).toLowerCase();

    if (str.includes('demo') || str.includes('razer') || str.includes('razor')) {
      studentMatches++;
      console.log(`\n========================================`);
      console.log(`MATCHED STUDENT ID: ${id}`);
      const cleanData = { ...data };
      if (cleanData.photoURL && cleanData.photoURL.length > 200) cleanData.photoURL = cleanData.photoURL.substring(0, 60) + '...';
      if (cleanData.faceDescriptor) cleanData.faceDescriptor = '[faceDescriptor omitted]';
      console.log(JSON.stringify(cleanData, null, 2));
    }
  });

  console.log(`\nTotal student matches: ${studentMatches}`);

  console.log("\nFetching users...");
  const usersSnap = await db.collection('users').get();
  console.log(`Fetched ${usersSnap.size} users.`);
  let userMatches = 0;
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const str = (id + ' ' + JSON.stringify(data)).toLowerCase();
    if (str.includes('demo') || str.includes('razer') || str.includes('razor')) {
      userMatches++;
      console.log(`\n========================================`);
      console.log(`MATCHED USER ID: ${id}`);
      const cleanData = { ...data };
      if (cleanData.photoURL && cleanData.photoURL.length > 200) cleanData.photoURL = cleanData.photoURL.substring(0, 60) + '...';
      console.log(JSON.stringify(cleanData, null, 2));
    }
  });
  console.log(`\nTotal user matches: ${userMatches}`);

  await app.delete();
  process.exit(0);
}

search().catch(err => {
  console.error(err);
  process.exit(1);
});

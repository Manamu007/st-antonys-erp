import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  console.log("Checking doc YigiZTE5oFYA72tye7MWjBURIWO2...");
  const collections = ['users', 'students', 'admissions', 'parents'];
  for (const col of collections) {
    const docSnap = await db.collection(col).doc('YigiZTE5oFYA72tye7MWjBURIWO2').get();
    if (docSnap.exists) {
      console.log(`\n=== Found YigiZTE5oFYA72tye7MWjBURIWO2 in ${col} ===`);
      const data = { ...docSnap.data() };
      // Omit large base64 strings if any (like photo or faceDescriptor)
      if (data.photoURL && data.photoURL.length > 200) data.photoURL = data.photoURL.substring(0, 50) + '...[truncated]';
      if (data.faceDescriptor) data.faceDescriptor = '[faceDescriptor data]';
      console.log(JSON.stringify(data, null, 2));
    }
  }

  // Also query students by any field containing 'demo' or 'razer' or 'razor' or student id or email
  console.log("\nSearching students where name/email/id matches 'demo' or 'razerpay'...");
  const studentsSnap = await db.collection('students').get();
  console.log(`Total students in DB: ${studentsSnap.size}`);
  
  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const name = String(data.name || data.firstName || '').toLowerCase();
    const email = String(data.email || '').toLowerCase();
    const parentEmail = String(data.parentEmail || '').toLowerCase();
    const phone = String(data.phone || data.contact || '').toLowerCase();
    const uid = String(data.uid || '').toLowerCase();

    if (
      name.includes('demo') || name.includes('razer') || name.includes('razor') ||
      email.includes('demo') || email.includes('razer') || email.includes('razor') ||
      parentEmail.includes('demo') || parentEmail.includes('razer') || parentEmail.includes('razor') ||
      id.includes('demo') || id.includes('razer') || id.includes('razor') ||
      uid.includes('demo') || uid.includes('razer') || uid.includes('razor')
    ) {
      console.log(`\n>>> Matched Student Doc ID: ${id}`);
      const cleanData = { ...data };
      if (cleanData.photoURL && cleanData.photoURL.length > 200) cleanData.photoURL = cleanData.photoURL.substring(0, 50) + '...[truncated]';
      if (cleanData.faceDescriptor) cleanData.faceDescriptor = '[faceDescriptor data]';
      console.log(JSON.stringify(cleanData, null, 2));
    }
  });

  // Also check users collection
  console.log("\nSearching users collection for demo / razer / razor...");
  const usersSnap = await db.collection('users').get();
  console.log(`Total users in DB: ${usersSnap.size}`);
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const name = String(data.name || data.displayName || '').toLowerCase();
    const email = String(data.email || '').toLowerCase();
    if (
      name.includes('demo') || name.includes('razer') || name.includes('razor') ||
      email.includes('demo') || email.includes('razer') || email.includes('razor') ||
      id.includes('demo') || id.includes('razer') || id.includes('razor')
    ) {
      console.log(`\n>>> Matched User Doc ID: ${id}`);
      const cleanData = { ...data };
      if (cleanData.photoURL && cleanData.photoURL.length > 200) cleanData.photoURL = cleanData.photoURL.substring(0, 50) + '...[truncated]';
      console.log(JSON.stringify(cleanData, null, 2));
    }
  });

  process.exit(0);
}

run().catch(console.error);

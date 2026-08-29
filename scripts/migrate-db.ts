import { getDbAdmin, initializationPromise } from '../src/server/firebaseAdmin.js';
import 'dotenv/config';

async function migrate() {
  console.log("Waiting for Firebase Admin initialization...");
  await initializationPromise;
  const db = getDbAdmin();
  
  if (!db) {
    console.error("FAILED to initialize Firebase Admin. Please check your firebase-applet-config.json and project environment.");
    process.exit(1);
  }

  console.log("Initialized DB. Starting migration...");

  const usersColl = db.collection('users');
  const studentsColl = db.collection('students');
  const staffColl = db.collection('staff');

  const snapshot = await usersColl.get();
  console.log(`Found ${snapshot.size} documents in 'users' collection.`);

  let batch = db.batch();
  let count = 0;
  const batchLimit = 200;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const uid = doc.id;
    const role = (data.role || '').toLowerCase();

    // 1. Prepare Identity Data (essential fields for Auth/Identity)
    const identityData = {
      uid,
      email: data.email || null,
      displayName: data.displayName || data.name || data.fullName || null,
      role: role,
      accountStatus: data.accountStatus || data.status || 'active',
      isSystemSet: data.isSystemSet || false,
      updatedAt: new Date().toISOString()
    };

    // 2. Prepare Detailed Profile Data
    if (role === 'student' || role === 'parent') {
      const studentProfile = {
        ...data, // Keep all existing fields in the detailed profile
        uid,
        updatedAt: new Date().toISOString()
      };
      batch.set(studentsColl.doc(uid), studentProfile, { merge: true });
      console.log(`[Student] Queued: ${uid} (${role})`);
    } else if (role !== 'none' && role !== '') {
      // All other roles go to staff collection (teachers, admins, etc.)
      const staffProfile = {
        ...data,
        uid,
        updatedAt: new Date().toISOString()
      };
      batch.set(staffColl.doc(uid), staffProfile, { merge: true });
      console.log(`[Staff] Queued: ${uid} (${role})`);
    }

    // 3. Transform 'users' doc to clean identity document
    batch.set(usersColl.doc(uid), identityData);

    count++;
    if (count % batchLimit === 0) {
      console.log(`Committing batch of ${batchLimit} documents...`);
      await batch.commit();
      batch = db.batch();
    }
  }

  if (count % batchLimit !== 0) {
    console.log(`Committing final batch...`);
    await batch.commit();
  }

  console.log(`✅ SUCCESS: Migration finished. Processed ${count} users.`);
}

migrate().catch(err => {
  console.error("❌ MIGRATION FAILED:", err);
  process.exit(1);
});

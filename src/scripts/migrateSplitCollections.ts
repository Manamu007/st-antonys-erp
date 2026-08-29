import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

/**
 * MIGRATION SCRIPT: Split 'users' collection into 'users', 'students', and 'staff'
 * 
 * Usage:
 * 1. Download your Firebase Admin SDK service account key JSON.
 * 2. Save it as 'service-account.json' in the root directory.
 * 3. Run: npx tsx src/scripts/migrateSplitCollections.ts
 */

async function migrate() {
  const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
  
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('Error: service-account.json not found in root directory.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  const app = getApps().length === 0 
    ? initializeApp({ credential: cert(serviceAccount) })
    : getApp();

  const db = getFirestore(app);

  console.log('--- Starting Migration: Splitting users collection ---');

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  console.log(`Found ${snapshot.size} documents in 'users' collection.`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const id = doc.id;
    const role = data.role;

    console.log(`Processing [${id}] - Role: ${role}`);

    const coreIdentityFields = [
      'uid', 'email', 'name', 'role', 'photoURL', 'status', 'pushToken', 'createdAt', 'v'
    ];

    const identityData: any = {};
    const profileData: any = {};

    Object.keys(data).forEach(key => {
      if (coreIdentityFields.includes(key)) {
        identityData[key] = data[key];
        // Mirror basic fields into profile for easy listing/filtering
        if (['name', 'email', 'photoURL', 'status'].includes(key)) {
          profileData[key] = data[key];
        }
      } else {
        profileData[key] = data[key];
      }
    });

    // Ensure UID is present in profile
    profileData.uid = id;

    try {
      const batch = db.batch();

      if (role === 'student') {
        const studentRef = db.collection('students').doc(id);
        batch.set(studentRef, profileData);
        console.log(` -> Moving profile fields to 'students/${id}'`);
      } else if (role === 'teacher' || role === 'staff' || role === 'clerk' || role === 'accountant' || role === 'vice_principal') {
        const staffRef = db.collection('staff').doc(id);
        batch.set(staffRef, profileData);
        console.log(` -> Moving profile fields to 'staff/${id}'`);
      }

      // Cleanup users collection to keep only identity data
      batch.set(doc.ref, identityData);
      
      await batch.commit();
      migratedCount++;
    } catch (err) {
      console.error(`Failed to migrate ${id}:`, err);
    }
  }

  console.log('\n--- Migration Completed ---');
  console.log(`Successfully migrated: ${migratedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

migrate().catch(console.error);

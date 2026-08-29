import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  
  const badId = 'NtxGiuOjaaWzcoG2W8HwBczHN72';  // typo one (missing Q)
  const goodId = 'NtxGiuOjaaWzcoQG2W8HwBczHN72'; // correct one (with Q)

  console.log(`Starting migration from [${badId}] to [${goodId}]...`);

  // 1. Migrate 'staff' document
  const badStaffDoc = await db.collection('staff').doc(badId).get();
  if (badStaffDoc.exists) {
    const staffData = badStaffDoc.data();
    console.log("Found staff document with typo. Data:", staffData);
    
    // Write to correct ID
    await db.collection('staff').doc(goodId).set({
      ...staffData,
      uid: goodId,
      id: goodId
    }, { merge: true });
    console.log(`Successfully copied staff document to [${goodId}]`);
    
    // Delete typo one
    await db.collection('staff').doc(badId).delete();
    console.log(`Successfully deleted old staff document with typo [${badId}]`);
  } else {
    console.log(`No staff document found with typo ID [${badId}]`);
  }

  // 2. Migrate 'users' document
  const badUserDoc = await db.collection('users').doc(badId).get();
  if (badUserDoc.exists) {
    const userData = badUserDoc.data();
    console.log("Found user document with typo. Data:", userData);
    
    await db.collection('users').doc(goodId).set({
      ...userData,
      uid: goodId,
      id: goodId
    }, { merge: true });
    console.log(`Successfully copied user document to [${goodId}]`);
    
    await db.collection('users').doc(badId).delete();
    console.log(`Successfully deleted old user document with typo [${badId}]`);
  } else {
    console.log(`No user document found with typo ID [${badId}]`);
  }

  // 3. Update 'staff_attendance' referencing the bad ID
  // Let's search inside staff_attendance where userId == badId
  const badAttendanceDocs = await db.collection('staff_attendance').where('userId', '==', badId).get();
  console.log(`Found ${badAttendanceDocs.size} staff_attendance records with bad ID reference.`);
  for (const doc of badAttendanceDocs.docs) {
    const attData = doc.data();
    console.log(`Updating staff_attendance record [${doc.id}]: changing userId from ${badId} to ${goodId}`);
    await db.collection('staff_attendance').doc(doc.id).update({
      userId: goodId
    });
  }

  // Let's also check if there are documents with id == badId in staff_attendance
  const badAttDoc = await db.collection('staff_attendance').doc(badId).get();
  if (badAttDoc.exists) {
    const attData = badAttDoc.data();
    console.log(`Found a staff_attendance document where ID is the bad ID. Data:`, attData);
    await db.collection('staff_attendance').doc(goodId).set({
      ...attData,
      userId: goodId
    });
    await db.collection('staff_attendance').doc(badId).delete();
    console.log(`Successfully migrated staff_attendance document with ID [${badId}] to [${goodId}]`);
  }

  // 4. Update 'login_logs'
  const loginLogs = await db.collection('login_logs').where('userId', '==', badId).get();
  console.log(`Found ${loginLogs.size} login_logs referencing bad ID.`);
  for (const doc of loginLogs.docs) {
    await db.collection('login_logs').doc(doc.id).update({
      userId: goodId
    });
  }

  console.log("Migration complete!");
}

run().catch(console.error);

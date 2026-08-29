import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';
import { DEVELOPER_ACCOUNTS, SYSTEM_ACCOUNTS } from './src/constants/systemAccounts.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Checking and fixing user roles in 'users' collection...");
  const snap = await db.collection('users').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const email = (data.email || '').toLowerCase().trim();
    if (DEVELOPER_ACCOUNTS.includes(email) || SYSTEM_ACCOUNTS.includes(email)) {
      if (data.role !== 'super_admin' && data.role !== 'admin') {
        console.log(`Fixing doc ${doc.id} (${email}): role was '${data.role}', changing to 'super_admin'`);
        await db.collection('users').doc(doc.id).update({
          role: 'super_admin'
        });
      } else {
        console.log(`Doc ${doc.id} (${email}): role is already '${data.role}'`);
      }
    }
  }

  // Also check if any student record has email manamunagaraju@gmail.com and clear or update the student email so fallback doesn't map developer email to student
  const studentSnap = await db.collection('students').get();
  for (const doc of studentSnap.docs) {
    const data = doc.data();
    const email = (data.email || '').toLowerCase().trim();
    if (DEVELOPER_ACCOUNTS.includes(email)) {
      console.log(`Removing developer email ${email} from student doc ${doc.id} (${data.name || ''})`);
      await db.collection('students').doc(doc.id).update({
        email: ''
      });
    }
  }

  console.log("User role fix complete.");
  process.exit(0);
}

run().catch(console.error);

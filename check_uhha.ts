import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function checkUHHa() {
  await initializationPromise;
  const db = getDbAdmin();

  const collections = ['users', 'students', 'admissions', 'parents'];
  for (const c of collections) {
    const doc = await db.collection(c).doc('UHHaE59mfkOgoAgUG9veacNfCuw1').get();
    if (doc.exists) {
      console.log(`Found UHHaE59mfkOgoAgUG9veacNfCuw1 in ${c}:`, doc.data());
    }
  }

  // Also check all documents in fees
  const feesSnap = await db.collection('fees').get();
  console.log(`\nAll fee documents:`);
  feesSnap.docs.forEach(d => {
    console.log(`- Fee Doc ID: ${d.id}, studentId: ${d.data().studentId}, studentUid: ${d.data().studentUid}`);
  });

  // Also check receipts, login_logs, whatsapp_logs
  console.log("\nSearching receipt_books & payslips...");
  const receipts = await db.collection('receipt_books').get();
  receipts.docs.forEach(d => {
    console.log(`Receipt: ${d.id}`, d.data());
  });

  process.exit(0);
}

checkUHHa().catch(console.error);

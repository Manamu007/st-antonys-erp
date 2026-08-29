import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("--- LATEST WHATSAPP LOGS ---");
  const logsSnap = await db.collection('whatsapp_logs')
    .orderBy('timestamp', 'desc')
    .limit(30)
    .get();

  console.log(`Found ${logsSnap.size} logs.`);
  logsSnap.docs.forEach((doc, idx) => {
    const data = doc.data();
    console.log(`[LOG ${idx + 1}] ID: ${doc.id} | Timestamp: ${data.timestamp}`);
    console.log(`  Type: ${data.type} | Info:`, JSON.stringify(data));
  });

  console.log("\n--- SCHOOL SETTINGS ---");
  const settingsSnap = await db.collection('settings').doc('school').get();
  if (settingsSnap.exists) {
    console.log(JSON.stringify(settingsSnap.data(), null, 2));
  } else {
    console.log("School settings document 'school' does not exist.");
  }

  process.exit(0);
}

run().catch(console.error);

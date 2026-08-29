import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Checking whatsapp_logs...");
  const snap = await db.collection('whatsapp_logs')
    .orderBy('timestamp', 'desc')
    .limit(30)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`[Log] ${data.timestamp} | Type: ${data.type} | Msg: ${data.errorMessage || data.errorMsg || JSON.stringify(data)}`);
  }

  process.exit(0);
}

run().catch(console.error);

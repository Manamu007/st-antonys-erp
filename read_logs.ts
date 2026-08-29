import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Fetching last 1000 logs from whatsapp_logs for in-memory filtering...");
  const snap = await db.collection('whatsapp_logs')
    .orderBy('timestamp', 'desc')
    .limit(1000)
    .get();

  let count = 0;
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (data.type === 'heartbeat') return;
    count++;
    console.log(`\nLog ID: ${doc.id} | Timestamp: ${data.timestamp} | Type: ${data.type}`);
    console.log(JSON.stringify(data, null, 2));
  });
  console.log(`\nFound ${count} non-heartbeat logs in the last 1000 records.`);

  process.exit(0);
}

run().catch(console.error);

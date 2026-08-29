import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Fetching last 300 logs from whatsapp_logs to scan in memory...");
  const snap = await db.collection('whatsapp_logs')
    .orderBy('timestamp', 'desc')
    .limit(300)
    .get();

  console.log(`Found ${snap.size} logs to scan.`);
  const filtered = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((data: any) => ['context_search', 'match_found'].includes(data.type));

  console.log(`Found ${filtered.length} logs matching context_search & match_found:`);
  filtered.forEach(data => {
    console.log(`\nLog ID: ${data.id} | Timestamp: ${data.timestamp} | Type: ${data.type}`);
    console.log(JSON.stringify(data, null, 2));
  });

  process.exit(0);
}

run().catch(console.error);

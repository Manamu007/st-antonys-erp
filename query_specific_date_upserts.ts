import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("--- SCANNING FOR NON-HEARTBEAT LOGS ON 2026-06-17 ---");
  const logsSnap = await db.collection('whatsapp_logs')
    .where('timestamp', '>=', '2026-06-17T15:00:00.000Z')
    .where('timestamp', '<=', '2026-06-17T15:40:00.000Z')
    .get();

  console.log(`Found ${logsSnap.size} logs registered.`);
  
  const filtered = logsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() as any }))
    .filter(doc => doc.type !== 'heartbeat')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  console.log(`Found ${filtered.length} NON-HEARTBEAT logs.`);
  filtered.forEach((doc, idx) => {
    console.log(`[NON-HEARTBEAT ${idx + 1}] Timestamp: ${doc.timestamp} | Type: ${doc.type}\n  Data: ${JSON.stringify(doc)}`);
  });

  process.exit(0);
}

run().catch(console.error);

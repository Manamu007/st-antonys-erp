import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("--- SCANNING FOR UPSERT EVENTS ---");
  const upserts = await db.collection('whatsapp_logs')
    .where('type', '==', 'upsert_event')
    .limit(10)
    .get();

  console.log(`Found ${upserts.size} strict 'upsert_event' logs.`);
  upserts.docs.forEach((doc, idx) => {
    console.log(`[UPSERT ${idx + 1}] ID: ${doc.id} | data:`, JSON.stringify(doc.data()));
  });

  console.log("--- SCANNING FOR MATCH FOUND ---");
  const matches = await db.collection('whatsapp_logs')
    .where('type', '==', 'match_found')
    .limit(10)
    .get();

  console.log(`Found ${matches.size} strict 'match_found' logs.`);
  matches.docs.forEach((doc, idx) => {
    console.log(`[MATCH ${idx + 1}] ID: ${doc.id} | data:`, JSON.stringify(doc.data()));
  });

  process.exit(0);
}

run().catch(console.error);

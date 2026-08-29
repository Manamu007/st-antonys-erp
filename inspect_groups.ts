import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Checking whatsapp_discovered_groups...");
  const snap = await db.collection('whatsapp_discovered_groups').get();
  console.log(`Found ${snap.size} groups in firestore:`);
  for (const doc of snap.docs) {
    console.log(`Group ID: ${doc.id} | Name: "${doc.data().subject}" | isCommunity: ${doc.data().isCommunity}`);
  }

  process.exit(0);
}

run().catch(console.error);

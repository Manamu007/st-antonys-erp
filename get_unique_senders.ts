import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Extracting unique sender numbers from whatsapp_logs...");
  const snap = await db.collection('whatsapp_logs').get();
  console.log(`Found ${snap.size} logs in total.`);

  const senders = new Map<string, number>();
  const matchFounds = new Map<string, string>();

  snap.docs.forEach(doc => {
    const data = doc.data();
    if (data.from) {
      senders.set(data.from, (senders.get(data.from) || 0) + 1);
    }
    if (data.type === 'match_found' && data.from && data.userName) {
      matchFounds.set(data.from, `${data.userName} (${data.userRole || 'no-role'})`);
    }
  });

  console.log("\n--- Unique sender numbers and log counts ---");
  senders.forEach((count, from) => {
    const match = matchFounds.get(from) || "Not identified";
    console.log(`- From: ${from} | Total logs: ${count} | Identified as: ${match}`);
  });

  process.exit(0);
}

run().catch(console.error);

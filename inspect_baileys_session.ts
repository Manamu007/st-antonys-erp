import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  console.log("Checking whatsapp_sessions...");
  const snap = await db.collection('whatsapp_sessions').get();
  console.log(`Found ${snap.size} sessions:`);
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`Session: ${doc.id}`);
    console.log(`- updatedAt: ${data.updatedAt}`);
    const creds = data.creds ? JSON.parse(data.creds) : null;
    if (creds) {
      console.log(`- Creds keys: ${Object.keys(creds).join(', ')}`);
      console.log(`- Me:`, JSON.stringify(creds.me));
      console.log(`- SignalIdentities:`, creds.signalIdentities ? creds.signalIdentities.length : 'none');
    } else {
      console.log(`- No creds.`);
    }
    
    const keysSnap = await doc.ref.collection('keys').get();
    console.log(`- Total keys: ${keysSnap.size}`);
  }

  process.exit(0);
}

run().catch(console.error);

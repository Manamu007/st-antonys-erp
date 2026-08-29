import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  
  console.log("Reading documents from 'message_templates' collection...");
  const snap = await db.collection('message_templates').get();
  console.log(`Found ${snap.size} templates:`);
  snap.docs.forEach(doc => {
    console.log(`\n- Document ID: ${doc.id}`);
    console.log(`  Event: ${doc.data().event}`);
    console.log(`  Name: ${doc.data().name}`);
    console.log(`  Content: ${doc.data().content}`);
    console.log(`  Placeholders: ${JSON.stringify(doc.data().placeholders)}`);
  });
}

run().catch(console.error);

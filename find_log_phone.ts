import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const queryNums = ["9440989858", "8822269999"];
  console.log(`Searching logs for numbers: ${queryNums.join(', ')}`);

  const snap = await db.collection('whatsapp_logs').get();
  console.log(`Checking all ${snap.size} logs...`);
  let count = 0;
  snap.docs.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data);
    let matched = false;
    queryNums.forEach(num => {
      if (str.includes(num)) {
        matched = true;
      }
    });

    if (matched) {
      count++;
      console.log(`\nLog ID: ${doc.id} | Timestamp: ${data.timestamp} | Type: ${data.type}`);
      console.log(JSON.stringify(data, null, 2));
    }
  });

  console.log(`Found ${count} matching logs.`);
  process.exit(0);
}

run().catch(console.error);

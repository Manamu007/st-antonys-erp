import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const queryName = "nagaraju";
  console.log(`Searching database for name: ${queryName}`);

  const collections = ['users', 'staff', 'students'];
  for (const col of collections) {
    console.log(`\n--- Searching ${col} ---`);
    const snap = await db.collection(col).get();
    let count = 0;
    snap.docs.forEach(doc => {
      const data = doc.data();
      const str = JSON.stringify(data).toLowerCase();
      if (str.includes(queryName) || doc.id.toLowerCase().includes(queryName)) {
        count++;
        console.log(`Document ID: ${doc.id} contains ${queryName}:`);
        console.log(JSON.stringify(data, null, 2));
      }
    });
    console.log(`Finished ${col}. Matches: ${count}`);
  }

  process.exit(0);
}

run().catch(console.error);

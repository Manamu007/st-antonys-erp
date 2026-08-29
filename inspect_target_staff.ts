import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  if (!db) {
    console.error("No DB connection.");
    process.exit(1);
  }

  const staffId = "zr2sAQ459VbjW4XOBr2ggbuP5fy1";
  console.log(`Fetching staff document by ID: ${staffId}`);

  const doc = await db.collection('staff').doc(staffId).get();
  if (doc.exists) {
    console.log("Document exists!");
    console.log(JSON.stringify(doc.data(), null, 2));
  } else {
    console.log("Document does not exist.");
  }

  process.exit(0);
}

run().catch(console.error);

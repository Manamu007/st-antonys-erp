import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function test() {
  await initializationPromise;
  const db = getDbAdmin();
  try {
    const snapshot = await db.collection('receipt_books').get();
    console.log(`Success, found ${snapshot.size} receipt books`);
    snapshot.docs.forEach(doc => {
      console.log(`- Receipt Book ID: ${doc.id}, data:`, doc.data());
    });
  } catch(e: any) {
    console.error("Error:", e.message);
  }
}

test().catch(console.error);

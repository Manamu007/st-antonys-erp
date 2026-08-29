import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  
  const ids = ['venkata_guna_vyshnavi_k_91630111', 'venki_k_91949211', 'venkata_guna_vyshnavi_k_916301183894', 'venki_k_919492286652'];
  for (const id of ids) {
    const doc = await db.collection('students').doc(id).get();
    if (doc.exists) {
      console.log(`\n=== Document: ${id} ===`);
      console.log(JSON.stringify(doc.data(), null, 2));
    }
  }
}

run().catch(console.error);

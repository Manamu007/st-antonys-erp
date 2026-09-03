import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();

  const searchTerms = ['demo', 'demostudent', 'razerpay', 'razorpay', 'razer', 'razor', 'demostudentrazerpay'];
  console.log(`Searching for terms: ${searchTerms.join(', ')} across all Firestore collections...\n`);

  const collections = [
    'students',
    'users',
    'parents',
    'admissions',
    'fees',
    'payments',
    'fee_payments',
    'transactions',
    'razorpay_orders',
    'online_payments',
    'student_fees'
  ];

  for (const collName of collections) {
    try {
      const snap = await db.collection(collName).get();
      console.log(`Checking collection '${collName}' (${snap.size} documents)...`);
      
      const matchedDocs: any[] = [];
      snap.docs.forEach(doc => {
        const id = doc.id;
        const data = doc.data();
        const str = (id + ' ' + JSON.stringify(data)).toLowerCase();
        
        for (const term of searchTerms) {
          if (str.includes(term)) {
            matchedDocs.push({ id, data, matchedTerm: term });
            break;
          }
        }
      });

      if (matchedDocs.length > 0) {
        console.log(`>>> Found ${matchedDocs.length} matches in '${collName}':`);
        matchedDocs.forEach(m => {
          console.log(`\n[${collName}] ID: ${m.id} (matched '${m.matchedTerm}')`);
          console.log(JSON.stringify(m.data, null, 2));
        });
      }
    } catch (e: any) {
      console.log(`Error or collection not found for '${collName}': ${e.message}`);
    }
  }

  // Also do a listCollections to see all available root collections
  console.log("\n--- Listing all collections in database: ---");
  const allColls = await db.listCollections();
  console.log("Root collections:", allColls.map(c => c.id));
}

run().catch(console.error);

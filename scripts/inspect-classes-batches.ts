import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectClassesAndBatches() {
  console.log('=== CLASSES ===');
  const classesSnap = await getDocs(collection(db, 'classes'));
  classesSnap.forEach(d => {
    console.log(`Class doc id: ${d.id}`, d.data());
  });

  console.log('\n=== BATCHES ===');
  const batchesSnap = await getDocs(collection(db, 'batches'));
  batchesSnap.forEach(d => {
    console.log(`Batch doc id: ${d.id}`, d.data());
  });

  process.exit(0);
}

inspectClassesAndBatches().catch(console.error);

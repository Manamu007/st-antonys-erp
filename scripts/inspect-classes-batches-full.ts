import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectClassesAndBatches() {
  const classesSnap = await getDocs(collection(db, 'classes'));
  const batchesSnap = await getDocs(collection(db, 'batches'));
  
  console.log("=== CLASSES ===");
  classesSnap.forEach(d => {
    console.log(`Class ID: ${d.id}, Data:`, d.data());
  });

  console.log("\n=== BATCHES ===");
  batchesSnap.forEach(d => {
    console.log(`Batch ID: ${d.id}, Data:`, d.data());
  });
  
  process.exit(0);
}

inspectClassesAndBatches().catch(console.error);

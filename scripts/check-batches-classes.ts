import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkAllBatchesAndClasses() {
  const cSnap = await getDocs(collection(db, 'classes'));
  console.log("=== CLASSES ===");
  cSnap.forEach(d => {
    console.log(`Class ID: ${d.id} | Name: ${d.data().name}`);
  });

  const bSnap = await getDocs(collection(db, 'batches'));
  console.log("\n=== BATCHES ===");
  bSnap.forEach(d => {
    const data = d.data();
    console.log(`Batch ID: ${d.id.padEnd(20, ' ')} | Name: ${(data.name || '').padEnd(15, ' ')} | ClassId: ${(data.classId || '').padEnd(16, ' ')} | ClassName: ${(data.className || '').padEnd(10, ' ')}`);
  });

  process.exit(0);
}

checkAllBatchesAndClasses().catch(console.error);

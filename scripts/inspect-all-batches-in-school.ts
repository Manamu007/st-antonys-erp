import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectAllBatchesInSchool() {
  const bSnap = await getDocs(collection(db, 'batches'));
  console.log("=== ALL BATCHES IN DATABASE ===");
  bSnap.forEach(d => {
    const data = d.data();
    console.log(`Batch ID: ${d.id.padEnd(20, ' ')} | Name: ${(data.name || '').padEnd(12, ' ')} | ClassId: ${(data.classId || '').padEnd(16, ' ')} | ClassName: ${(data.className || '').padEnd(10, ' ')} | Teacher: ${data.classTeacherName || data.classTeacher || ''}`);
  });

  process.exit(0);
}

inspectAllBatchesInSchool().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectClass1Batches() {
  const batchesSnap = await getDocs(collection(db, 'batches'));
  console.log('=== BATCHES FOR 1 CLASS AND UKG ===');
  batchesSnap.forEach(d => {
    const data = d.data();
    if (data.classId === '1_Class_Class' || data.className?.includes('1') || data.classId === 'UKG_Class') {
      console.log(`Batch ID: "${d.id}" | Name: "${data.name}" | Class: "${data.className}" | classId: "${data.classId}" | teacher: "${data.classTeacherName || data.classTeacher}" | teacherId: "${data.classTeacherId}"`);
    }
  });
  process.exit(0);
}

inspectClass1Batches().catch(console.error);

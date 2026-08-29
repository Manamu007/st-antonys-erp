import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectStudentDeepDetails() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  const c1Students = all.filter(s => s.batchId === '1 Class_IPL' || s.batchId === '1 Class_M-Batch' || s.classId === '1_Class_Class');

  console.log(`Analyzing ${c1Students.length} Class 1 students...`);

  fs.writeFileSync('./class1_deep_inspection.json', JSON.stringify(c1Students, null, 2));

  // Also let's inspect the attendance collection to see what records exist for 1 Class
  const attSnap = await getDocs(collection(db, 'attendance'));
  console.log(`Total attendance records in DB: ${attSnap.size}`);
  const attSamples: any[] = [];
  attSnap.forEach(d => {
    const data = d.data();
    if (data.classId === '1_Class_Class' || data.batchId === '1 Class_IPL' || data.batchId === '1 Class_M-Batch') {
      attSamples.push({ id: d.id, date: data.date, batchId: data.batchId, classId: data.classId, recordsCount: data.records ? Object.keys(data.records).length : 0 });
    }
  });
  console.log(`1 Class attendance records: ${attSamples.length}`);
  console.log(attSamples.slice(0, 10));

  process.exit(0);
}

inspectStudentDeepDetails().catch(console.error);

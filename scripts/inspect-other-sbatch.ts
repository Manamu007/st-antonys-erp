import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectOtherSBatchDocs() {
  console.log("=== TIMETABLE DOCS FOR 1 CLASS S-BATCH ===");
  const ttSnap = await getDocs(collection(db, 'timetable'));
  const sbatchTT: any[] = [];
  ttSnap.forEach(d => {
    const data = d.data();
    if (data.batchId === '1 Class_S-Batch' || data.batch === 'S-Batch' || data.batchId === 'S-Batch' || d.id.includes('1 Class_S-Batch')) {
      sbatchTT.push({ id: d.id, ...data });
    }
  });
  console.log(`Found ${sbatchTT.length} timetable records for 1 Class S-Batch`);
  sbatchTT.slice(0, 5).forEach(t => console.log(t.id, t.day, t.subject, t.period));

  console.log("\n=== ATTENDANCE RECORDS FOR S-BATCH ===");
  const attSnap = await getDocs(collection(db, 'attendance'));
  const sbatchAtt: any[] = [];
  attSnap.forEach(d => {
    const data = d.data();
    if (data.batchId === '1 Class_S-Batch' || data.batch === 'S-Batch' || data.batchId === 'S-Batch' || d.id.includes('S-Batch')) {
      sbatchAtt.push({ id: d.id, ...data });
    }
  });
  console.log(`Found ${sbatchAtt.length} attendance records for S-Batch`);
  sbatchAtt.forEach(a => console.log(a.id, a.date, a.batch, a.studentName || a.studentId));

  process.exit(0);
}

inspectOtherSBatchDocs().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function traceAllSBatches() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  const sBatchStudents = all.filter(s => {
    const b = String(s.batch || s.batchName || '').trim();
    const bId = String(s.batchId || '').trim();
    return b === 'S-Batch' || bId.includes('S-Batch');
  });

  console.log(`Total S-Batch students across entire school: ${sBatchStudents.length}`);
  
  // Group by (class, classId, batchId)
  const grouped: Record<string, any[]> = {};
  sBatchStudents.forEach(s => {
    const key = `class: "${s.class}" (classId: ${s.classId}) | batch: "${s.batch}" (batchId: ${s.batchId})`;
    grouped[key] = grouped[key] || [];
    grouped[key].push(s);
  });

  Object.entries(grouped).forEach(([k, list]) => {
    console.log(`\n[Count: ${list.length}] -> ${k}`);
  });

  process.exit(0);
}

traceAllSBatches().catch(console.error);

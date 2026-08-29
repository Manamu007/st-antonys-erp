import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectCustomStudDocs() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  const c1Docs = all.filter(s => s.classId === '1_Class_Class' || s.batchId?.startsWith('1 Class'));

  console.log("=== ALL STUDENTS IN 1 CLASS WITH THEIR ORIGINAL BATCH / BATCHID / CLASS / CLASSID ===");
  c1Docs.forEach(s => {
    console.log(`ID: ${s.id.padEnd(30, ' ')} | Roll: ${String(s.rollNumber || s.roll).padStart(2, ' ')} | Status: ${(s.status || '').padEnd(10, ' ')} | Class: "${s.class}" (classId: ${s.classId}) | Batch: "${s.batch}" (batchId: ${s.batchId}) | Name: ${s.name} | Father: ${s.fatherName}`);
  });

  process.exit(0);
}

inspectCustomStudDocs().catch(console.error);

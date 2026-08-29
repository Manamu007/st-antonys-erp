import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkTeachersInStudents() {
  console.log('--- Checking if any teachers exist in students collection ---');
  const snap = await getDocs(collection(db, 'students'));
  snap.forEach(d => {
    const data = d.data();
    const role = (data.role || '').toLowerCase();
    const designation = (data.designation || '').toLowerCase();
    const name = (data.name || data.firstName || '').toLowerCase();
    if (role.includes('teacher') || role.includes('staff') || designation || name.includes('thriveni') || name.includes('padmavathi') || name.includes('radha') || name.includes('fayaz') || name.includes('reshmabhi') || name.includes('shobha')) {
      console.log(`[STUDENT DOC IS A TEACHER?] id=${d.id} | name=${data.name} | role=${data.role} | classId=${data.classId} | batchId=${data.batchId} | designation=${data.designation}`);
    }
  });

  console.log('\n--- Checking 1 Class IPL and 1 Class M-Batch in batches collection ---');
  const batchesSnap = await getDocs(collection(db, 'batches'));
  batchesSnap.forEach(b => {
    const d = b.data();
    if (b.id.includes('1 Class') || d.classId === '1_Class_Class' || d.classId === '1 Class') {
      console.log(`Batch ${b.id}:`, d);
    }
  });

  process.exit(0);
}

checkTeachersInStudents().catch(console.error);

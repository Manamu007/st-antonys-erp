import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function dumpClass1() {
  console.log('=== Class 1 Batches ===');
  const batchesSnap = await getDocs(collection(db, 'batches'));
  batchesSnap.forEach(d => {
    const data = d.data();
    const str = (d.id + ' ' + (data.name || '') + ' ' + (data.classId || '') + ' ' + (data.className || '')).toLowerCase();
    if (str.includes('1') && !str.includes('10')) {
      console.log('BATCH:', d.id, JSON.stringify(data));
    }
  });

  console.log('\n=== Class 1 Classes ===');
  const classesSnap = await getDocs(collection(db, 'classes'));
  classesSnap.forEach(d => {
    const data = d.data();
    const str = (d.id + ' ' + (data.name || '')).toLowerCase();
    if (str.includes('1') && !str.includes('10')) {
      console.log('CLASS:', d.id, JSON.stringify(data));
    }
  });

  console.log('\n=== Class 1 Students ===');
  const studentsSnap = await getDocs(collection(db, 'students'));
  const list: any[] = [];
  studentsSnap.forEach(d => {
    const data = d.data();
    const c = String(data.class || data.className || '').toLowerCase();
    if (c === '1 class' || c === '1st class' || c === 'class 1' || c === '1' || c.startsWith('1 ')) {
      list.push({
        id: d.id,
        name: data.name || data.fullName,
        class: data.class || data.className,
        batch: data.batch || data.batchId,
        batchName: data.batchName,
        status: data.status,
        roll: data.rollNumber || data.rollNo
      });
    }
  });

  console.log(`Found ${list.length} Class 1 students:`);
  console.log('Breakdown by batch:');
  const batchCounts: Record<string, number> = {};
  list.forEach(s => {
    const b = `${s.batch} (batchName: ${s.batchName})`;
    batchCounts[b] = (batchCounts[b] || 0) + 1;
    if (String(s.batch).toLowerCase().includes('ipl')) {
      console.log(`IPL Student: ${s.id} | Name=${s.name} | Batch=${s.batch} | Status=${s.status} | Roll=${s.roll}`);
    }
  });
  console.log('Batch counts:', batchCounts);

  process.exit(0);
}

dumpClass1().catch(console.error);

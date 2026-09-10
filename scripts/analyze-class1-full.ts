import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, '(default)');

async function analyzeAllClass1Details() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  // Find all students currently associated with 1 Class
  const class1Docs = all.filter(s => 
    s.classId === '1_Class_Class' || 
    s.batchId === '1 Class_IPL' || 
    s.batchId === '1 Class_M-Batch' ||
    s.batchId === '1 Class_S-Batch' ||
    s.class === '1 Class'
  );

  console.log(`Total records mentioning 1 Class: ${class1Docs.length}`);

  // Let's analyze:
  // 1. UKG students to route to UKG
  const ukgToMove = class1Docs.filter(s => s.class === 'UKG');
  console.log(`\n=== 1. UKG Students in 1 Class (${ukgToMove.length}) ===`);
  ukgToMove.forEach(s => {
    console.log(`ID: ${s.id} | Name: ${s.name} | Roll: ${s.rollNumber} | Class: ${s.class} -> UKG_Class | Batch: ${s.batch} -> ${s.batch === 'Section A' ? 'UKG_SectionA' : s.batch === 'Section B' ? 'UKG_SectionB' : 'UKG_SectionC'}`);
  });

  // 2. 2 Class students to route to 2 Class
  const c2ToMove = class1Docs.filter(s => s.class === '2 Class');
  console.log(`\n=== 2. 2 Class Students in 1 Class (${c2ToMove.length}) ===`);
  c2ToMove.forEach(s => {
    console.log(`ID: ${s.id} | Name: ${s.name} | Roll: ${s.rollNumber} | Class: ${s.class} -> 2_Class_Class | Batch: ${s.batch} -> ${s.batch === 'IPL' ? '2 Class_IPL' : s.batch === 'M-Batch' ? '2 Class_M-Batch' : '2 Class_S-Batch'}`);
  });

  // 3. Demo students to delete or mark inactive
  const demoStudents = class1Docs.filter(s => s.id.startsWith('student_1786081827075') || (s.name && s.name.toLowerCase().includes('demo student')));
  console.log(`\n=== 3. Demo Students (${demoStudents.length}) ===`);
  demoStudents.forEach(s => console.log(`ID: ${s.id} | Name: ${s.name}`));

  // 4. 1 Class pure students
  const pure1Class = class1Docs.filter(s => 
    s.class !== 'UKG' && 
    s.class !== '2 Class' && 
    !demoStudents.some(d => d.id === s.id)
  );

  console.log(`\n=== 4. Pure 1 Class Students (${pure1Class.length}) ===`);

  // Let's divide pure 1 Class by batch
  const iplPure = pure1Class.filter(s => {
    const b = String(s.batch || s.batchName || '').trim();
    if (b === 'S-Batch' || s.batchId === '1 Class_S-Batch') return false;
    if (b === 'M-Batch' && s.id !== 'stud_1781674909709') return false; // M-batch
    return b === 'IPL' || (!b && s.batchId === '1 Class_IPL') || (b === '' && !s.batchId);
  });

  const mBatchPure = pure1Class.filter(s => {
    const b = String(s.batch || s.batchName || '').trim();
    if (b === 'S-Batch' || s.batchId === '1 Class_S-Batch') return false;
    return b === 'M-Batch' || (!b && s.batchId === '1 Class_M-Batch');
  });

  const sBatchPure = pure1Class.filter(s => {
    const b = String(s.batch || s.batchName || '').trim();
    return b === 'S-Batch' || s.batchId === '1 Class_S-Batch';
  });

  console.log(`Pure IPL: ${iplPure.length}, Pure M-Batch: ${mBatchPure.length}, Pure S-Batch: ${sBatchPure.length}`);

  process.exit(0);
}

analyzeAllClass1Details().catch(console.error);

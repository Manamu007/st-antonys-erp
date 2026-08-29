import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectAllBatchesAndStudents() {
  const studentsSnap = await getDocs(collection(db, 'students'));
  const allStudents: any[] = [];
  studentsSnap.forEach(d => allStudents.push({ id: d.id, ...d.data() }));

  // Check UKG batches and student counts
  const ukgA = allStudents.filter(s => s.batchId === 'UKG_SectionA');
  const ukgB = allStudents.filter(s => s.batchId === 'UKG_SectionB');
  const ukgC = allStudents.filter(s => s.batchId === 'UKG_SectionC');
  console.log(`UKG Students: Section A: ${ukgA.length}, Section B: ${ukgB.length}, Section C: ${ukgC.length}`);

  // Check 2 Class batches
  const c2IPL = allStudents.filter(s => s.batchId === '2 Class_IPL');
  const c2M = allStudents.filter(s => s.batchId === '2 Class_M-Batch');
  const c2S = allStudents.filter(s => s.batchId === '2 Class_S-Batch');
  console.log(`2 Class Students: IPL: ${c2IPL.length}, M-Batch: ${c2M.length}, S-Batch: ${c2S.length}`);

  // Let's find all students with 'UKG' or '2 Class' in their `class` field or `id` or other fields
  const ukgFoundInOther: any[] = [];
  const c2FoundInOther: any[] = [];
  
  allStudents.forEach(s => {
    const c = String(s.class || s.className || '').trim();
    const b = String(s.batch || s.batchName || '').trim();
    if (c === 'UKG' && s.classId !== 'UKG_Class') {
      ukgFoundInOther.push({ id: s.id, name: s.name, roll: s.rollNumber, class: c, classId: s.classId, batch: b, batchId: s.batchId, father: s.fatherName });
    }
    if (c === '2 Class' && s.classId !== '2_Class_Class') {
      c2FoundInOther.push({ id: s.id, name: s.name, roll: s.rollNumber, class: c, classId: s.classId, batch: b, batchId: s.batchId, father: s.fatherName });
    }
  });

  console.log(`\nUKG students found in wrong classId (${ukgFoundInOther.length}):`);
  console.log(JSON.stringify(ukgFoundInOther, null, 2));

  console.log(`\n2 Class students found in wrong classId (${c2FoundInOther.length}):`);
  console.log(JSON.stringify(c2FoundInOther, null, 2));

  process.exit(0);
}

inspectAllBatchesAndStudents().catch(console.error);

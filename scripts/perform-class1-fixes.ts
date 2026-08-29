import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function performClass1Fixes() {
  console.log("Starting Class 1 & Misplaced Student Correction...");

  // 1. Ensure 1 Class S-Batch exists in `batches`
  const sBatchRef = doc(db, 'batches', '1 Class_S-Batch');
  await setDoc(sBatchRef, {
    id: '1 Class_S-Batch',
    name: 'S-Batch',
    classId: '1_Class_Class',
    className: '1 Class',
    academicYear: '2026-2027',
    status: 'active'
  }, { merge: true });
  console.log("✓ Ensured '1 Class_S-Batch' batch exists in batches collection.");

  // Fetch all students
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  const c1Docs = all.filter(s => 
    s.classId === '1_Class_Class' || 
    s.batchId === '1 Class_IPL' || 
    s.batchId === '1 Class_M-Batch' ||
    s.batchId === '1 Class_S-Batch' ||
    s.class === '1 Class'
  );

  console.log(`Found ${c1Docs.length} records to process.`);

  let ukgMoved = 0;
  let c2Moved = 0;
  let demoRemoved = 0;
  let sBatchUpdated = 0;
  let mBatchUpdated = 0;
  let iplUpdated = 0;

  for (const s of c1Docs) {
    const sRef = doc(db, 'students', s.id);
    const c = String(s.class || s.className || '').trim();
    const b = String(s.batch || s.batchName || '').trim();
    const bId = String(s.batchId || '').trim();
    const name = String(s.name || s.firstName || '').trim();

    // A. Demo student
    if (name.toLowerCase().includes('demo student') || s.id.startsWith('student_1786081827075')) {
      await deleteDoc(sRef);
      demoRemoved++;
      console.log(`- Deleted demo student: ${s.name} (${s.id})`);
      continue;
    }

    // B. UKG students
    if (c === 'UKG') {
      let targetBatchId = 'UKG_SectionA';
      let targetBatchName = 'Section A';
      if (b === 'Section B' || bId.includes('SectionB') || b.toLowerCase().includes('section b')) {
        targetBatchId = 'UKG_SectionB';
        targetBatchName = 'Section B';
      } else if (b === 'Section C' || bId.includes('SectionC') || b.toLowerCase().includes('section c')) {
        targetBatchId = 'UKG_SectionC';
        targetBatchName = 'Section C';
      }

      await updateDoc(sRef, {
        classId: 'UKG_Class',
        class: 'UKG',
        className: 'UKG',
        batchId: targetBatchId,
        batch: targetBatchName,
        batchName: targetBatchName
      });
      ukgMoved++;
      console.log(`- Moved UKG student: ${s.name} -> UKG_Class / ${targetBatchId}`);
      continue;
    }

    // C. 2 Class students
    if (c === '2 Class') {
      let targetBatchId = '2 Class_IPL';
      let targetBatchName = 'IPL';
      if (b === 'M-Batch' || bId.includes('M-Batch')) {
        targetBatchId = '2 Class_M-Batch';
        targetBatchName = 'M-Batch';
      } else if (b === 'S-Batch' || bId.includes('S-Batch')) {
        targetBatchId = '2 Class_S-Batch';
        targetBatchName = 'S-Batch';
      }

      await updateDoc(sRef, {
        classId: '2_Class_Class',
        class: '2 Class',
        className: '2 Class',
        batchId: targetBatchId,
        batch: targetBatchName,
        batchName: targetBatchName
      });
      c2Moved++;
      console.log(`- Moved 2 Class student: ${s.name} -> 2_Class_Class / ${targetBatchId}`);
      continue;
    }

    // D. 1 Class S-Batch students
    if (b === 'S-Batch' || bId === '1 Class_S-Batch') {
      await updateDoc(sRef, {
        classId: '1_Class_Class',
        class: '1 Class',
        className: '1 Class',
        batchId: '1 Class_S-Batch',
        batch: 'S-Batch',
        batchName: 'S-Batch'
      });
      sBatchUpdated++;
      continue;
    }

    // E. 1 Class M-Batch students (including Aman Sk and Venkata Rithvik M)
    if (b === 'M-Batch' || bId === '1 Class_M-Batch' || s.id === 'aman_sk_91964111' || s.id === 'venkata_rithvik_m_91939911') {
      await updateDoc(sRef, {
        classId: '1_Class_Class',
        class: '1 Class',
        className: '1 Class',
        batchId: '1 Class_M-Batch',
        batch: 'M-Batch',
        batchName: 'M-Batch'
      });
      mBatchUpdated++;
      continue;
    }

    // F. 1 Class IPL students
    await updateDoc(sRef, {
      classId: '1_Class_Class',
      class: '1 Class',
      className: '1 Class',
      batchId: '1 Class_IPL',
      batch: 'IPL',
      batchName: 'IPL'
    });
    iplUpdated++;
  }

  console.log("\n=== Migration Summary ===");
  console.log(`- UKG students sent to UKG: ${ukgMoved}`);
  console.log(`- 2 Class students sent to 2 Class: ${c2Moved}`);
  console.log(`- Demo students removed: ${demoRemoved}`);
  console.log(`- 1 Class S-Batch students updated: ${sBatchUpdated}`);
  console.log(`- 1 Class M-Batch students updated: ${mBatchUpdated}`);
  console.log(`- 1 Class IPL students updated: ${iplUpdated}`);

  process.exit(0);
}

performClass1Fixes().catch(console.error);

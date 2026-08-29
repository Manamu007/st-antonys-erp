import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function verifyLiveDb() {
  console.log("=== LIVE DATABASE VERIFICATION ===");

  // 1. Check Batches for 1 Class
  const batchesSnap = await getDocs(collection(db, 'batches'));
  const c1Batches: any[] = [];
  batchesSnap.forEach(d => {
    const data = d.data();
    if (data.classId === '1_Class_Class' || d.id.startsWith('1 Class')) {
      c1Batches.push({ id: d.id, ...data });
    }
  });
  console.log(`\nBatches for 1 Class (${c1Batches.length}):`);
  c1Batches.forEach(b => console.log(`  - [${b.id}] Name: ${b.name}, Status: ${b.status}, ClassId: ${b.classId}`));

  // 2. Fetch all students
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  const batches = ['1 Class_IPL', '1 Class_M-Batch', '1 Class_S-Batch'];
  for (const bId of batches) {
    const studentsInBatch = all.filter(s => s.batchId === bId && s.classId === '1_Class_Class');
    console.log(`\n=================== BATCH: ${bId} (${studentsInBatch.length} students) ===================`);
    const active = studentsInBatch.filter(s => s.status === 'active' || !s.status);
    const inactive = studentsInBatch.filter(s => s.status !== 'active' && s.status);
    console.log(`Active: ${active.length}, Inactive: ${inactive.length}`);

    active.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
    active.forEach(s => {
      console.log(`  Roll ${String(s.rollNumber || s.roll).padStart(2, ' ')}: ${s.name.padEnd(32, ' ')} | Father: ${(s.fatherName || '').padEnd(25, ' ')} | ID: ${s.id}`);
    });
  }

  // 3. Verify UKG moved students
  const ukgIds = ['lavanya_j_91789411', 'pranay_p_91630511', 'pravikanshith_k_91964211', 'riswitha_k_916311', 'venkata_mokshith_y_91939811', 'venkata_thanush_k_91630511', 'vijaya_k_91939911', 'yashwitha_k_91966411'];
  console.log('\n=== UKG MOVED STUDENTS STATUS ===');
  ukgIds.forEach(id => {
    const s = all.find(x => x.id === id);
    if (s) {
      console.log(`  - ${s.name.padEnd(28, ' ')} | ClassId: ${s.classId} | BatchId: ${s.batchId}`);
    }
  });

  // 4. Verify 2 Class moved students
  const c2Ids = ['arjun_tej_kumar_m_91964311', 'jahnavi_s_91944111'];
  console.log('\n=== 2 CLASS MOVED STUDENTS STATUS ===');
  c2Ids.forEach(id => {
    const s = all.find(x => x.id === id);
    if (s) {
      console.log(`  - ${s.name.padEnd(28, ' ')} | ClassId: ${s.classId} | BatchId: ${s.batchId}`);
    }
  });

  process.exit(0);
}

verifyLiveDb().catch(console.error);

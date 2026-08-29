import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function analyzeClass1Students() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.classId === '1_Class_Class' || data.class === '1 Class') {
      all.push({
        id: d.id,
        name: data.name || data.firstName,
        father: data.fatherName || data.parentName,
        roll: data.rollNumber || data.rollNo,
        classId: data.classId,
        class: data.class,
        batchId: data.batchId,
        batch: data.batch,
        status: data.status,
        academicYear: data.academicYear,
        updatedAt: data.updatedAt
      });
    }
  });

  console.log(`=== TOTAL STUDENTS IN CLASS 1: ${all.length} ===`);
  
  console.log('\n--- Real UKG Students misassigned to Class 1 ---');
  all.filter(s => s.class === 'UKG' || s.batch?.startsWith('Section')).forEach(s => {
    console.log(`[MISASSIGNED UKG] ${s.id} | Name: ${s.name} | Roll: ${s.roll} | Class: ${s.class} | Batch: ${s.batch} | classId: ${s.classId} | batchId: ${s.batchId}`);
  });

  console.log('\n--- 1 Class Students with batch M-Batch ---');
  all.filter(s => s.batch === 'M-Batch' || s.batchId === '1 Class_M-Batch').forEach(s => {
    console.log(`[M-BATCH] ${s.id} | Name: ${s.name} | Roll: ${s.roll} | Batch: ${s.batch} | batchId: ${s.batchId} | status: ${s.status}`);
  });

  console.log('\n--- 1 Class Students with batch IPL ---');
  all.filter(s => s.batch === 'IPL' && s.class !== 'UKG').forEach(s => {
    console.log(`[IPL] ${s.id} | Name: ${s.name} | Roll: ${s.roll} | Batch: ${s.batch} | batchId: ${s.batchId} | status: ${s.status}`);
  });

  console.log('\n--- 1 Class Students with batch S-Batch ---');
  all.filter(s => s.batch === 'S-Batch' && s.class !== 'UKG').forEach(s => {
    console.log(`[S-BATCH] ${s.id} | Name: ${s.name} | Roll: ${s.roll} | Batch: ${s.batch} | batchId: ${s.batchId} | status: ${s.status}`);
  });

  console.log('\n--- Inactive Students in Class 1 ---');
  all.filter(s => s.status === 'inactive').forEach(s => {
    console.log(`[INACTIVE] ${s.id} | Name: ${s.name} | Roll: ${s.roll} | Batch: ${s.batch} | batchId: ${s.batchId}`);
  });

  process.exit(0);
}

analyzeClass1Students().catch(console.error);

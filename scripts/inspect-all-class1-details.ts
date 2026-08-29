import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectAllClass1Details() {
  const studentsSnap = await getDocs(collection(db, 'students'));
  console.log('=== ALL STUDENTS ASSOCIATED WITH 1 CLASS OR UKG OR PREVIOUS SCRIPT ===');
  
  const relevantStudents: any[] = [];
  studentsSnap.forEach(d => {
    const s = d.data();
    const cId = s.classId || '';
    const cName = s.class || s.className || '';
    const bId = s.batchId || '';
    const bName = s.batch || s.batchName || '';
    
    if (cId.includes('1') || cName.includes('1') || bId.includes('1') || bName.includes('1') || cId.includes('UKG') || cName.includes('UKG')) {
      relevantStudents.push({
        id: d.id,
        name: s.name || s.firstName,
        fatherName: s.fatherName || s.parentName,
        rollNo: s.rollNumber || s.rollNo,
        classId: s.classId,
        class: s.class,
        batchId: s.batchId,
        batch: s.batch,
        batchName: s.batchName,
        status: s.status,
        academicYear: s.academicYear
      });
    }
  });

  console.log(`Total found: ${relevantStudents.length}`);
  // Let's group by classId and batchId
  const groups: Record<string, any[]> = {};
  relevantStudents.forEach(s => {
    const key = `classId: [${s.classId}] | class: [${s.class}] | batchId: [${s.batchId}] | batch: [${s.batch}]`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  for (const [k, list] of Object.entries(groups)) {
    console.log(`\n======================================================`);
    console.log(`GROUP: ${k} (Count: ${list.length})`);
    console.log(`======================================================`);
    list.forEach(s => {
      console.log(`  ID: ${s.id} | Roll: ${s.rollNo} | Name: ${s.name} | Father: ${s.fatherName} | Status: ${s.status}`);
    });
  }

  process.exit(0);
}

inspectAllClass1Details().catch(console.error);

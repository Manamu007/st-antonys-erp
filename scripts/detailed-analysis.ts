import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function detailedAnalysis() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  const class1 = all.filter(s => {
    const c = (s.className || s.class || s.classId || '').toLowerCase().trim();
    return c === '1 class' || c === 'class 1' || c === '1_class' || c === '1_class_class' || c.startsWith('1 ');
  });

  const demoStudents = class1.filter(s => s.id.startsWith('student_'));
  const regularStudents = class1.filter(s => !s.id.startsWith('student_'));

  console.log(`Regular students: ${regularStudents.length}`);
  console.log(`Demo/system students (id starts with student_): ${demoStudents.length}`);

  const activeRegular = regularStudents.filter(s => s.status === 'active' || (!s.status && !s.nonAttending && s.isActive !== false));
  const inactiveRegular = regularStudents.filter(s => s.status === 'inactive' || s.status === 'dropped' || s.status === 'tc_issued');
  const nonAttendingRegular = regularStudents.filter(s => s.status === 'non_attending' || s.nonAttending === true);

  console.log(`Active regular: ${activeRegular.length}`);
  console.log(`Inactive regular: ${inactiveRegular.length}`);
  console.log(`Non-attending regular: ${nonAttendingRegular.length}`);

  console.log("\n=== ALL ACTIVE REGULAR STUDENTS (Total: " + activeRegular.length + ") ===");
  activeRegular.forEach((s, idx) => {
    console.log(`${(idx + 1).toString().padStart(3, ' ')}. [${s.id}] ${s.name.padEnd(35, ' ')} | Current Batch: ${(s.batch || s.batchId || '').padEnd(10, ' ')} | Current Roll: ${(s.rollNumber || '').toString().padEnd(4, ' ')} | Gender: ${s.gender || 'N/A'}`);
  });

  process.exit(0);
}

detailedAnalysis().catch(console.error);

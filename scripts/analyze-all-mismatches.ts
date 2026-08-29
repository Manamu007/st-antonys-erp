import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function fullStudentAnalysis() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => {
    all.push({ id: d.id, ...d.data() });
  });

  console.log(`Total students in collection: ${all.length}`);

  // Let's find all students where class/batch fields don't match classId/batchId!
  const mismatches: any[] = [];
  all.forEach(s => {
    const cId = s.classId || '';
    const cName = s.class || s.className || '';
    const bId = s.batchId || '';
    const bName = s.batch || s.batchName || '';

    let hasIssue = false;
    let reason = '';

    // If student has explicit class in doc like "UKG", "2 Class", "LKG", "Nursery" but classId is "1_Class_Class"
    if (cName && cName !== '1 Class' && cId === '1_Class_Class') {
      hasIssue = true;
      reason += `Class mismatch: class="${cName}" but classId="${cId}". `;
    }
    if (bName && !bId.includes(bName.replace(' ', '_')) && !bId.endsWith(bName) && !bName.includes(bId.replace('1 Class_', ''))) {
      hasIssue = true;
      reason += `Batch mismatch: batch="${bName}" but batchId="${bId}". `;
    }

    if (hasIssue) {
      mismatches.push({
        id: s.id,
        name: s.name,
        roll: s.rollNumber,
        status: s.status || 'active',
        class: cName,
        classId: cId,
        batch: bName,
        batchId: bId,
        father: s.fatherName,
        reason
      });
    }
  });

  console.log(`Total mismatched students in entire DB: ${mismatches.length}`);
  fs.writeFileSync('./all_mismatches.json', JSON.stringify(mismatches, null, 2));
  console.log('Saved to all_mismatches.json');

  process.exit(0);
}

fullStudentAnalysis().catch(console.error);

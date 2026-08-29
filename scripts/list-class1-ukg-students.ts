import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function listAllClass1AndUKGStudents() {
  const snap = await getDocs(collection(db, 'students'));
  const list: any[] = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.classId === '1_Class_Class' || data.class === '1 Class' || data.batchId === '1 Class_IPL' || data.batchId === '1 Class_M-Batch' || data.classId === 'UKG_Class' || data.class === 'UKG') {
      list.push({
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
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    }
  });

  console.log(`Found ${list.length} students in 1 Class or UKG:`);
  console.log(JSON.stringify(list, null, 2));
  process.exit(0);
}

listAllClass1AndUKGStudents().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function traceAllStudents() {
  const snap = await getDocs(collection(db, 'students'));
  const allStudents: any[] = [];
  snap.forEach(d => {
    allStudents.push({ id: d.id, ...d.data() });
  });

  console.log(`Total students: ${allStudents.length}`);
  
  // Let's filter students whose id or data has 1 Class or UKG or 2 Class
  const class1Students = allStudents.filter(s => 
    s.classId === '1_Class_Class' || 
    s.class === '1 Class' || 
    (s.batchId && s.batchId.startsWith('1 Class_'))
  );

  console.log(`Students associated with Class 1: ${class1Students.length}`);

  // Let's analyze the properties of each student in Class 1:
  // - s.id
  // - s.name
  // - s.rollNumber
  // - s.class (string stored in doc)
  // - s.classId (string stored in doc)
  // - s.batch (string stored in doc)
  // - s.batchId (string stored in doc)
  // - s.status
  // - s.academicYear
  // - s.fatherName
  
  fs.writeFileSync('./class1_full_analysis.json', JSON.stringify(class1Students, null, 2));
  console.log('Saved class1_full_analysis.json');
  process.exit(0);
}

traceAllStudents().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkTeachersInStudentsCol() {
  console.log('--- Checking if Padmavathi, Radha, Thriveni are in students collection ---');
  const ids = [
    'padmavathi_919494362217',
    'radha.p_919030653776',
    'thriveni_m_6303700835',
    'thriveni.n_7032163406',
    'kdrdArL1yDegTx1sOP3nm8j7B662'
  ];

  for (const id of ids) {
    const sDoc = await getDoc(doc(db, 'students', id));
    console.log(`students/${id} exists?`, sDoc.exists(), sDoc.exists() ? sDoc.data() : '');
    const uDoc = await getDoc(doc(db, 'users', id));
    console.log(`users/${id} exists?`, uDoc.exists(), uDoc.exists() ? { name: uDoc.data()?.name, role: uDoc.data()?.role, classId: uDoc.data()?.classId, batchId: uDoc.data()?.batchId } : '');
  }

  // Also check if any doc in students has role teacher or staff
  const snap = await getDocs(collection(db, 'students'));
  let nonStudents = 0;
  snap.forEach(d => {
    const data = d.data();
    if (data.role && data.role !== 'student') {
      console.log(`Non-student in students collection: id=${d.id}, name=${data.name}, role=${data.role}`);
      nonStudents++;
    }
  });
  console.log(`Total non-students in students collection: ${nonStudents}`);

  process.exit(0);
}

checkTeachersInStudentsCol().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkAllClass1() {
  console.log('=== STUDENTS COLLECTION (ALL DOCS WITH CLASS 1) ===');
  const studentsSnap = await getDocs(collection(db, 'students'));
  studentsSnap.forEach(d => {
    const data = d.data();
    const c = `${data.classId || ''} ${data.class || ''} ${data.className || ''}`.toLowerCase();
    if (c.includes('1') && !c.includes('10') && !c.includes('11') && !c.includes('12')) {
      console.log(`[STUDENT] id: "${d.id}" | name: "${data.name || data.firstName}" | roll: "${data.rollNumber || data.rollNo}" | classId: "${data.classId}" | class: "${data.class}" | batchId: "${data.batchId}" | batch: "${data.batch}" | status: "${data.status}" | role: "${data.role}"`);
    }
  });

  console.log('\n=== USERS COLLECTION (ALL DOCS WITH CLASS 1) ===');
  const usersSnap = await getDocs(collection(db, 'users'));
  usersSnap.forEach(d => {
    const data = d.data();
    const c = `${data.classId || ''} ${data.class || ''} ${data.className || ''}`.toLowerCase();
    const b = `${data.batchId || ''} ${data.batch || ''} ${JSON.stringify(data.batchIds || '')}`.toLowerCase();
    if ((c.includes('1') && !c.includes('10') && !c.includes('11') && !c.includes('12')) || b.includes('1 class')) {
      console.log(`[USER] id: "${d.id}" | name: "${data.name || data.firstName}" | role: "${data.role}" | email: "${data.email}" | classId: "${data.classId}" | batchId: "${data.batchId}" | batch: "${data.batch}" | batchIds: ${JSON.stringify(data.batchIds)}`);
    }
  });

  process.exit(0);
}

checkAllClass1().catch(console.error);

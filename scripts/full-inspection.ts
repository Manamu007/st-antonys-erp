import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function fullInspection() {
  console.log('=== FULL INSPECTION OF ANTONY-DATABASE1 ===');

  // 1. Check all staff
  const staffSnap = await getDocs(collection(db, 'staff'));
  console.log(`\nTotal Staff in DB: ${staffSnap.size}`);
  const staffList: any[] = [];
  staffSnap.forEach(d => {
    staffList.push({ id: d.id, ...d.data() });
  });

  // 2. Check all batches
  const batchesSnap = await getDocs(collection(db, 'batches'));
  console.log(`\nTotal Batches in DB: ${batchesSnap.size}`);
  const batchList: any[] = [];
  batchesSnap.forEach(d => {
    const data = d.data();
    batchList.push({ id: d.id, ...data });
    console.log(`BATCH [${d.id}]: Class="${data.className}" Batch="${data.name}" Teacher="${data.classTeacher}" TeacherName="${data.classTeacherName}" TeacherId="${data.classTeacherId}" Email="${data.classTeacherEmail}"`);
  });

  // 3. Check all classes
  const classesSnap = await getDocs(collection(db, 'classes'));
  console.log(`\nTotal Classes in DB: ${classesSnap.size}`);
  classesSnap.forEach(d => {
    const data = d.data();
    console.log(`CLASS [${d.id}]: Name="${data.name || data.className}" Incharge="${data.incharge || data.teacher || data.classTeacher}"`);
  });

  // 4. Check all users (non-students or all)
  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`\nTotal Users in DB: ${usersSnap.size}`);
  const usersList: any[] = [];
  usersSnap.forEach(d => {
    usersList.push({ id: d.id, ...d.data() });
  });

  // 5. Search for specific keywords across staff and users
  const keywords = [
    'anil', 'babu', 'balaiah', 'balayya', 'bala', 'nageswar', 'nageswara', 'nageswareddy', 'nagesh', 'guravaiah',
    '8074572283', '916301545697', 'stantonys7m', 'stantonys7thm', 'stantonys8m', 'stantonys9m', 'stantonys10m'
  ];

  console.log('\n--- KEYWORD SEARCH IN STAFF ---');
  staffList.forEach(s => {
    const str = JSON.stringify(s).toLowerCase();
    for (const kw of keywords) {
      if (str.includes(kw)) {
        console.log(`[STAFF MATCH '${kw}'] ID: ${s.id}`, JSON.stringify(s, null, 2));
        break;
      }
    }
  });

  console.log('\n--- KEYWORD SEARCH IN USERS ---');
  usersList.forEach(u => {
    const str = JSON.stringify(u).toLowerCase();
    for (const kw of keywords) {
      if (str.includes(kw)) {
        if (u.role !== 'student' || kw !== 'babu' && kw !== 'bala' && kw !== 'reddy') {
          console.log(`[USER MATCH '${kw}'] ID: ${u.id}`, JSON.stringify(u, null, 2));
          break;
        }
      }
    }
  });

  // 6. Check specific IDs directly
  const checkIds = [
    'anil_babu_916301545697',
    'anil_babu.p_916301545697',
    'anil_babu_8074572283',
    'balaiah_916301545697',
    'balaiah',
    'nageswar_reddy',
    'nageswareddy',
    'nageswara_reddy'
  ];

  console.log('\n--- DIRECT ID CHECKS IN STAFF & USERS ---');
  for (const id of checkIds) {
    const staffDoc = await getDoc(doc(db, 'staff', id));
    if (staffDoc.exists()) console.log(`DIRECT STAFF FOUND for ID ${id}:`, staffDoc.data());
    const userDoc = await getDoc(doc(db, 'users', id));
    if (userDoc.exists()) console.log(`DIRECT USER FOUND for ID ${id}:`, userDoc.data());
  }

  // 7. Dump all staff records to json file for reference
  fs.writeFileSync('./all_staff_inspect.json', JSON.stringify({ staff: staffList, batches: batchList }, null, 2));
  console.log('\nWrote ./all_staff_inspect.json');

  process.exit(0);
}

fullInspection().catch(console.error);

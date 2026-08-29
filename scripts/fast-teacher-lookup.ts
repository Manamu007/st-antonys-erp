import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function searchFast() {
  console.log('Fast querying staff, leaves, batches, timetables...');

  // 1. Staff
  const staffSnap = await getDocs(collection(db, 'staff'));
  console.log(`Staff collection has ${staffSnap.size} docs.`);
  const allStaff: any[] = [];
  staffSnap.forEach(d => allStaff.push({ id: d.id, ...d.data() }));

  const keywords = ['anil', 'babu', 'balaiah', 'balayya', 'nageswar', 'nageswareddy', 'nagesh', '8074572283'];

  console.log('\n=== STAFF MATCHES ===');
  allStaff.forEach(s => {
    const str = JSON.stringify(s).toLowerCase();
    if (keywords.some(k => str.includes(k))) {
      console.log(`FOUND in staff (${s.id}): name="${s.name}", email="${s.email}", phone="${s.phone || s.whatsappNumber}", role="${s.role}", status="${s.status}", deleted=${s.isDeleted}, hasDemoNameRemoved=${s.hasDemoNameRemoved}`);
      console.log(JSON.stringify(s, null, 2));
    }
  });

  // 2. Leaves
  const leavesSnap = await getDocs(collection(db, 'leaves'));
  console.log(`\nLeaves collection has ${leavesSnap.size} docs.`);
  leavesSnap.forEach(d => {
    const data = d.data();
    const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
    if (keywords.some(k => str.includes(k))) {
      console.log(`FOUND in leaves (${d.id}):`, JSON.stringify(data, null, 2));
    }
  });

  // 3. Batches
  const batchesSnap = await getDocs(collection(db, 'batches'));
  console.log(`\nBatches collection has ${batchesSnap.size} docs.`);
  batchesSnap.forEach(d => {
    const data = d.data();
    const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
    if (keywords.some(k => str.includes(k))) {
      console.log(`FOUND in batches (${d.id}): class=${data.className}, batch=${data.name}, teacher=${data.classTeacher}`);
    }
  });

  // 4. Timetables
  const ttSnap = await getDocs(collection(db, 'timetables'));
  console.log(`\nTimetables collection has ${ttSnap.size} docs.`);
  ttSnap.forEach(d => {
    const data = d.data();
    const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
    if (keywords.some(k => str.includes(k))) {
      console.log(`FOUND in timetables (${d.id}):`, JSON.stringify(data, null, 2));
    }
  });

  // 5. Let's dump all staff IDs and Names so we can see every single staff record in the DB!
  console.log('\n=== ALL STAFF SUMMARY LIST ===');
  allStaff.forEach((s, idx) => {
    console.log(`[${idx+1}] ID="${s.id}" | Name="${s.name}" | First="${s.firstName}" | Last="${s.lastName}" | Role="${s.role}" | Phone="${s.phone || s.whatsappNumber}" | Email="${s.email}" | DemoRemoved=${s.hasDemoNameRemoved}`);
  });

  process.exit(0);
}

searchFast().catch(console.error);

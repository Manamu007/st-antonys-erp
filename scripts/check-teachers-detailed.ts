import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkTeachersOnly() {
  console.log('Fetching staff, batches, leaves from antony-database1...');

  const [staffSnap, batchesSnap, leavesSnap] = await Promise.all([
    getDocs(collection(db, 'staff')),
    getDocs(collection(db, 'batches')),
    getDocs(collection(db, 'leaves'))
  ]);

  console.log(`\nFound: ${staffSnap.size} staff, ${batchesSnap.size} batches, ${leavesSnap.size} leaves.`);

  const staff: any[] = [];
  staffSnap.forEach(d => staff.push({ id: d.id, ...d.data() }));

  const batches: any[] = [];
  batchesSnap.forEach(d => batches.push({ id: d.id, ...d.data() }));

  const leaves: any[] = [];
  leavesSnap.forEach(d => leaves.push({ id: d.id, ...d.data() }));

  const searchKeywords = ['anil', 'babu', 'balaiah', 'balayya', 'bala', 'nageswar', 'nageswara', 'nageswareddy', 'nagesh', 'guravaiah', '8074572283'];

  console.log('\n================== STAFF MATCHES ==================');
  staff.forEach(s => {
    const str = JSON.stringify(s).toLowerCase();
    for (const kw of searchKeywords) {
      if (str.includes(kw)) {
        console.log(`[STAFF MATCH '${kw}'] ID: ${s.id} | Name: "${s.name}" | Email: "${s.email}" | Phone: "${s.phone || s.whatsappNumber}" | Role: "${s.role}" | Status: "${s.status}" | Deleted: ${s.isDeleted} | DemoRemoved: ${s.hasDemoNameRemoved}`);
        break;
      }
    }
  });

  console.log('\n================== BATCH MATCHES ==================');
  batches.forEach(b => {
    const str = JSON.stringify(b).toLowerCase();
    for (const kw of searchKeywords) {
      if (str.includes(kw)) {
        console.log(`[BATCH MATCH '${kw}'] ID: ${b.id} | Class: "${b.className}" | Batch: "${b.name}" | CT: "${b.classTeacher}" | CT-Email: "${b.classTeacherEmail}" | CT-ID: "${b.classTeacherId}"`);
        break;
      }
    }
  });

  console.log('\n================== LEAVE MATCHES ==================');
  leaves.forEach(l => {
    const str = JSON.stringify(l).toLowerCase();
    for (const kw of searchKeywords) {
      if (str.includes(kw)) {
        console.log(`[LEAVE MATCH '${kw}'] ID: ${l.id} | Applicant: "${l.applicantName}" | AppId: "${l.applicantId}" | Phone: "${l.phone || l.whatsappNumber}" | Batch: "${l.batchId}" | Status: "${l.status}"`);
        break;
      }
    }
  });

  // Also print all staff list so we can see every single person
  console.log('\n================== ALL STAFF LIST (${staff.length}) ==================');
  staff.forEach((s, idx) => {
    console.log(`[#${idx+1}] ID: ${s.id} | Name: "${s.name || s.displayName || (s.firstName ? s.firstName + ' ' + (s.lastName||'') : '')}" | Email: "${s.email}" | Phone: "${s.phone || s.whatsappNumber}" | Role: "${s.role}" | Desig: "${s.designation}" | Dept: "${s.department}" | Status: "${s.status}"`);
  });

  fs.writeFileSync('./detailed_staff_summary.json', JSON.stringify({ staff, batches, leaves }, null, 2));

  process.exit(0);
}

checkTeachersOnly().catch(console.error);

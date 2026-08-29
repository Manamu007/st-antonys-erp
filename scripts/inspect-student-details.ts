import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectStudentDetails() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  console.log(`Total students: ${all.length}`);

  // 1. Check for students with status === undefined or null or empty
  const noStatus = all.filter(s => !s.status);
  console.log(`\n=== STUDENTS WITH NO STATUS FIELD (${noStatus.length}) ===`);
  noStatus.forEach(s => console.log(`  - [${s.id}] ${s.name} (${s.class || s.classId} / ${s.batch || s.batchId}) - roll: ${s.rollNumber}`));

  // 2. Check for students with status 'non_attending'
  const nonAttending = all.filter(s => s.status === 'non_attending');
  console.log(`\n=== NON-ATTENDING STUDENTS (${nonAttending.length}) ===`);
  nonAttending.forEach(s => {
    console.log(`  - [${s.id}] ${s.name.padEnd(35, ' ')} | Class: ${(s.className || s.class || s.classId).padEnd(10, ' ')} | Batch: ${(s.batch || s.batchId).padEnd(15, ' ')} | Roll: ${s.rollNumber || 'NONE'}`);
  });

  // 3. Check for students with status 'inactive'
  const inactive = all.filter(s => s.status === 'inactive');
  console.log(`\n=== INACTIVE STUDENTS (${inactive.length}) === (first 25)`);
  inactive.slice(0, 25).forEach(s => {
    console.log(`  - [${s.id}] ${s.name.padEnd(35, ' ')} | Class: ${(s.className || s.class || s.classId).padEnd(10, ' ')} | Batch: ${(s.batch || s.batchId).padEnd(15, ' ')} | Roll: ${s.rollNumber || 'NONE'} | InactiveReason: ${s.inactiveReason || s.dropReason || s.tcReason || ''}`);
  });

  // 4. Check active students who might have inactive/non-attending hints in name, remarks, or notes
  const suspiciousActive = all.filter(s => {
    if (s.status !== 'active') return false;
    const str = `${s.name} ${s.notes || ''} ${s.remarks || ''} ${s.inactiveReason || ''} ${s.dropReason || ''} ${s.tcReason || ''}`.toLowerCase();
    return str.includes('inactive') || str.includes('dropped') || str.includes('left') || str.includes('tc') || str.includes('non attending') || str.includes('non-attending');
  });

  console.log(`\n=== ACTIVE STUDENTS WITH INACTIVE/NON-ATTENDING KEYWORDS (${suspiciousActive.length}) ===`);
  suspiciousActive.forEach(s => console.log(`  - [${s.id}] ${s.name} | Notes: ${s.notes || s.remarks || s.inactiveReason}`));

  // 5. Check students with empty roll numbers among active
  const activeNoRoll = all.filter(s => s.status === 'active' && (!s.rollNumber && s.rollNumber !== 0));
  console.log(`\n=== ACTIVE STUDENTS WITH EMPTY ROLL NUMBER (${activeNoRoll.length}) === (sample 20)`);
  activeNoRoll.slice(0, 20).forEach(s => console.log(`  - [${s.id}] ${s.name.padEnd(35, ' ')} | Class: ${(s.className || s.class || s.classId).padEnd(10, ' ')} | Batch: ${(s.batch || s.batchId).padEnd(15, ' ')}`));

  process.exit(0);
}

inspectStudentDetails().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectTeachers() {
  console.log('=== CHECKING SPECIFIC STAFF / USER DOCS ===');

  // Check Balaiah / Bala Guravaiah
  const balaStaff = await getDoc(doc(db, 'staff', 'p2Vp79bOrHMNOveOApuDSwtGoRH2'));
  const balaUser = await getDoc(doc(db, 'users', 'p2Vp79bOrHMNOveOApuDSwtGoRH2'));
  console.log('\nBalaiah Staff doc exists?', balaStaff.exists(), balaStaff.data());
  console.log('Balaiah User doc exists?', balaUser.exists(), balaUser.data());

  // Check Anil Babu
  const anilStaff = await getDoc(doc(db, 'staff', 'MaeIRGhcL6OkFOob251bTDnN0R53'));
  const anilUser = await getDoc(doc(db, 'users', 'MaeIRGhcL6OkFOob251bTDnN0R53'));
  console.log('\nAnil Babu Staff doc exists?', anilStaff.exists(), anilStaff.data());
  console.log('Anil Babu User doc exists?', anilUser.exists(), anilUser.data());

  // Check gl583IWdnSSgIdsou5PqE4VCK0o1 (7 Class S-Batch)
  const glStaff = await getDoc(doc(db, 'staff', 'gl583IWdnSSgIdsou5PqE4VCK0o1'));
  const glUser = await getDoc(doc(db, 'users', 'gl583IWdnSSgIdsou5PqE4VCK0o1'));
  console.log('\ngl583 Staff doc:', glStaff.exists(), glStaff.data());
  console.log('gl583 User doc:', glUser.exists(), glUser.data());

  // Check MimTTIMM4oSFgEvozkqgiviQ2lH3 (10 Class S-Batch)
  const mimStaff = await getDoc(doc(db, 'staff', 'MimTTIMM4oSFgEvozkqgiviQ2lH3'));
  const mimUser = await getDoc(doc(db, 'users', 'MimTTIMM4oSFgEvozkqgiviQ2lH3'));
  console.log('\nMim Staff doc:', mimStaff.exists(), mimStaff.data());
  console.log('Mim User doc:', mimUser.exists(), mimUser.data());

  // Check 4m34rfgCg7OsBdFO0oospNOxRmg1 (8 Class IPL)
  const f4mStaff = await getDoc(doc(db, 'staff', '4m34rfgCg7OsBdFO0oospNOxRmg1'));
  const f4mUser = await getDoc(doc(db, 'users', '4m34rfgCg7OsBdFO0oospNOxRmg1'));
  console.log('\n4m34 Staff doc:', f4mStaff.exists(), f4mStaff.data());
  console.log('4m34 User doc:', f4mUser.exists(), f4mUser.data());

  // Check 2QIY48vJRQTFYXB0Mp5K78gTtmX2 (10 Class IPL)
  const f2qStaff = await getDoc(doc(db, 'staff', '2QIY48vJRQTFYXB0Mp5K78gTtmX2'));
  const f2qUser = await getDoc(doc(db, 'users', '2QIY48vJRQTFYXB0Mp5K78gTtmX2'));
  console.log('\n2QIY Staff doc:', f2qStaff.exists(), f2qStaff.data());
  console.log('2QIY User doc:', f2qUser.exists(), f2qUser.data());

  // Check all subjects for any teacher names
  const subjectsSnap = await getDocs(collection(db, 'subjects'));
  console.log(`\nSubjects collection size: ${subjectsSnap.size}`);
  subjectsSnap.forEach(d => {
    const s = d.data();
    if (s.teacher || s.teacherName) {
      console.log(`Subject [${d.id}]: name="${s.name}" teacher="${s.teacher || s.teacherName}"`);
    }
  });

  // Check all users for "Nageswara" or "Nageswar" or "Nagesh" or "Nageswareddy"
  const usersSnap = await getDocs(collection(db, 'users'));
  console.log(`\nChecking all ${usersSnap.size} users for Nageswar / Nagesh...`);
  usersSnap.forEach(d => {
    const u = d.data();
    const str = JSON.stringify(u).toLowerCase();
    if (str.includes('nages') || str.includes('nageswar') || str.includes('nagesh') || str.includes('nagi')) {
      console.log(`Matched USER for Nages: [${d.id}]`, u);
    }
  });

  // Check all staff for "Nageswar" or "Nagesh"
  const staffSnap = await getDocs(collection(db, 'staff'));
  staffSnap.forEach(d => {
    const s = d.data();
    const str = JSON.stringify(s).toLowerCase();
    if (str.includes('nages') || str.includes('nageswar') || str.includes('nagesh') || str.includes('nagi')) {
      console.log(`Matched STAFF for Nages: [${d.id}]`, s);
    }
  });

  process.exit(0);
}

inspectTeachers().catch(console.error);

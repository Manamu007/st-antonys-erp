import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || 'antony-database1');

async function checkEntireDatabaseForStaffStudentCollisions() {
  console.log("=== CHECKING ENTIRE DATABASE FOR STAFF/STUDENT CONFLICTS ===");

  const [usersSnap, staffSnap, studentsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'staff')),
    getDocs(collection(db, 'students'))
  ]);

  const staffEmails = new Set<string>();
  staffSnap.forEach(d => {
    const email = (d.data().email || '').toLowerCase().trim();
    if (email) staffEmails.add(email);
  });

  console.log(`Found ${staffEmails.size} staff emails in 'staff' collection.`);
  staffEmails.forEach(e => console.log(` - Staff Email: ${e}`));

  // Check if any staff email exists in 'students' collection!
  const studentConflictIds: string[] = [];
  studentsSnap.forEach(d => {
    const data = d.data();
    const email = (data.email || '').toLowerCase().trim();
    if (staffEmails.has(email) || email.startsWith('stantonys') || email.includes('teacher') || email.includes('staff')) {
      console.log(`⚠️ CONFLICT IN 'students' collection: Doc ID '${d.id}' has staff email '${email}'`);
      studentConflictIds.push(d.id);
    }
  });

  // Check 'users' collection for multiple docs with same email
  const userByEmailMap = new Map<string, any[]>();
  usersSnap.forEach(d => {
    const data = d.data();
    const email = (data.email || '').toLowerCase().trim();
    if (email) {
      if (!userByEmailMap.has(email)) userByEmailMap.set(email, []);
      userByEmailMap.get(email)!.push({ id: d.id, ...data });
    }
  });

  console.log("\n--- Emails with multiple user records ---");
  for (const [email, docs] of userByEmailMap.entries()) {
    if (docs.length > 1) {
      console.log(`\nEmail: '${email}' has ${docs.length} user records:`);
      docs.forEach(u => console.log(`  * ID: ${u.id} | Role: ${u.role} | Name: ${u.name}`));
    }
  }

  process.exit(0);
}

checkEntireDatabaseForStaffStudentCollisions();

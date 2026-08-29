import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || 'antony-database1');

async function thoroughCleanupAndProtection() {
  console.log("=======================================================");
  console.log("🔥 THOROUGH DATABASE CLEANUP & STAFF PROTECTION SCRIPT");
  console.log("=======================================================\n");

  const [usersSnap, staffSnap, studentsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'staff')),
    getDocs(collection(db, 'students'))
  ]);

  // 1. Gather all known staff emails
  const staffEmails = new Set<string>();
  
  staffSnap.forEach(d => {
    const email = (d.data().email || '').toLowerCase().trim();
    if (email) staffEmails.add(email);
  });

  usersSnap.forEach(d => {
    const data = d.data();
    const email = (data.email || '').toLowerCase().trim();
    const role = (data.role || '').toLowerCase();
    if (email && (role.includes('teacher') || role === 'staff' || role === 'admin' || role === 'principal' || role === 'vice_principal' || role === 'coordinator' || email.startsWith('stantonys'))) {
      staffEmails.add(email);
    }
  });

  console.log(`Identified ${staffEmails.size} staff/teacher email(s):`);
  staffEmails.forEach(e => console.log(` - ${e}`));

  // 2. Delete any records in 'students' collection that belong to staff emails or start with stantonys
  let deletedStudentDocs = 0;
  for (const sDoc of studentsSnap.docs) {
    const data = sDoc.data();
    const email = (data.email || '').toLowerCase().trim();
    const id = sDoc.id.toLowerCase();

    if (staffEmails.has(email) || email.startsWith('stantonys') || id.includes('stantonys9m') || id.includes('stantonys7m') || id.includes('stantonys8m') || id.includes('stantonys10m')) {
      console.log(`❌ Deleting invalid student doc '${sDoc.id}' (email: '${email}') from 'students' collection...`);
      await deleteDoc(doc(db, 'students', sDoc.id));
      deletedStudentDocs++;
    }
  }

  // 3. Delete any student records in 'users' collection that belong to staff emails
  let deletedUserStudentDocs = 0;
  for (const uDoc of usersSnap.docs) {
    const data = uDoc.data();
    const email = (data.email || '').toLowerCase().trim();
    const role = (data.role || '').toLowerCase();
    const id = uDoc.id.toLowerCase();

    if (staffEmails.has(email) && (role === 'student' || role === 'parent' || id.startsWith('student_'))) {
      console.log(`❌ Deleting invalid student user doc '${uDoc.id}' (email: '${email}', role: '${role}') from 'users' collection...`);
      await deleteDoc(doc(db, 'users', uDoc.id));
      deletedUserStudentDocs++;
    }
  }

  // 4. Ensure stantonys9m@gmail.com has clean, accurate teacher records in 'users' and 'staff'
  const stantonysEmail = 'stantonys9m@gmail.com';
  const cleanTeacherDoc = {
    id: stantonysEmail,
    uid: stantonysEmail,
    email: stantonysEmail,
    name: 'Stantonys9m',
    role: 'teacher_class',
    department: 'High School',
    designation: 'Class Teacher (Class 9 M)',
    status: 'active',
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'users', stantonysEmail), cleanTeacherDoc, { merge: true });
  await setDoc(doc(db, 'staff', stantonysEmail), cleanTeacherDoc, { merge: true });

  // If Auth UID doc exists, ensure it is also teacher_class
  const authUid = 'zh5p7FQVlaUDLYixQFiYoNdI8Yl1';
  await setDoc(doc(db, 'users', authUid), { ...cleanTeacherDoc, id: authUid, uid: authUid }, { merge: true });

  console.log(`\n=======================================================`);
  console.log(`✅ CLEANUP COMPLETED:`);
  console.log(`   - Deleted ${deletedStudentDocs} invalid doc(s) from 'students'`);
  console.log(`   - Deleted ${deletedUserStudentDocs} invalid doc(s) from 'users'`);
  console.log(`   - Verified 'stantonys9m@gmail.com' as Class Teacher in 'users' & 'staff'`);
  console.log(`=======================================================\n`);

  process.exit(0);
}

thoroughCleanupAndProtection();

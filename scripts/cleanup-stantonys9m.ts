import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || 'antony-database1');

async function cleanupStantonys9m() {
  console.log("=== CLEANING UP LEGACY STUDENT RECORDS FOR Stantonys9m ===");

  // 1. Delete legacy student document from 'students' collection
  try {
    await deleteDoc(doc(db, 'students', 'student_stantonys9m_gmail_com'));
    console.log("Deleted 'student_stantonys9m_gmail_com' from 'students' collection");
  } catch (e: any) {
    console.error("Error deleting from 'students':", e.message);
  }

  // 2. Delete legacy student document from 'users' collection
  try {
    await deleteDoc(doc(db, 'users', 'student_stantonys9m_gmail_com'));
    console.log("Deleted 'student_stantonys9m_gmail_com' from 'users' collection");
  } catch (e: any) {
    console.error("Error deleting from 'users':", e.message);
  }

  // 3. Update auth UID record in 'users' collection to Class Teacher
  try {
    await setDoc(doc(db, 'users', 'zh5p7FQVlaUDLYixQFiYoNdI8Yl1'), {
      uid: 'zh5p7FQVlaUDLYixQFiYoNdI8Yl1',
      id: 'zh5p7FQVlaUDLYixQFiYoNdI8Yl1',
      email: 'stantonys9m@gmail.com',
      name: 'Stantonys9m',
      role: 'teacher_class',
      department: 'High School',
      designation: 'Class Teacher (Class 9 M)',
      status: 'active',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("Updated UID doc 'zh5p7FQVlaUDLYixQFiYoNdI8Yl1' in 'users' to role 'teacher_class'");
  } catch (e: any) {
    console.error("Error updating UID doc in 'users':", e.message);
  }

  // 4. Ensure 'stantonys9m@gmail.com' in 'users' has 'teacher_class'
  try {
    await setDoc(doc(db, 'users', 'stantonys9m@gmail.com'), {
      uid: 'stantonys9m@gmail.com',
      id: 'stantonys9m@gmail.com',
      email: 'stantonys9m@gmail.com',
      name: 'Stantonys9m',
      role: 'teacher_class',
      department: 'High School',
      designation: 'Class Teacher (Class 9 M)',
      status: 'active',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("Updated 'stantonys9m@gmail.com' in 'users' to role 'teacher_class'");
  } catch (e: any) {
    console.error("Error updating 'stantonys9m@gmail.com' in 'users':", e.message);
  }

  // 5. Ensure 'staff' collection has clean teacher document
  try {
    await setDoc(doc(db, 'staff', 'stantonys9m@gmail.com'), {
      id: 'stantonys9m@gmail.com',
      uid: 'stantonys9m@gmail.com',
      email: 'stantonys9m@gmail.com',
      name: 'Stantonys9m',
      role: 'teacher_class',
      department: 'High School',
      designation: 'Class Teacher (Class 9 M)',
      status: 'active',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("Updated 'stantonys9m@gmail.com' in 'staff' collection");
  } catch (e: any) {
    console.error("Error updating 'staff':", e.message);
  }

  console.log("\nCleanup completed successfully!");
  process.exit(0);
}

cleanupStantonys9m();

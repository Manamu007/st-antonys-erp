import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkClass1Batches() {
  const q = query(collection(db, 'batches'), where('classId', '==', '1_Class_Class'));
  const snap = await getDocs(q);
  console.log("=== BATCHES FOR 1_Class_Class ===");
  snap.forEach(d => {
    console.log(`ID: ${d.id}, name: "${d.data().name}", className: "${d.data().className}", teacher: "${d.data().classTeacherName || d.data().classTeacher}"`);
  });
  
  // Also check all classes
  const cSnap = await getDocs(collection(db, 'classes'));
  console.log("\n=== ALL CLASSES ===");
  cSnap.forEach(d => {
    console.log(`ID: ${d.id}, name: "${d.data().name}"`);
  });

  process.exit(0);
}

checkClass1Batches().catch(console.error);

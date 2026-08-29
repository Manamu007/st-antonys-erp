import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
// Initialize with database ID 'antony-database1'
const db = initializeFirestore(app, {}, 'antony-database1');

async function run() {
  try {
    console.log('Querying users collection...');
    const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'play_school_incharge')));
    console.log('Found play_school_incharge users:', usersSnap.size);
    usersSnap.forEach(doc => {
      console.log('User ID:', doc.id);
      const data = doc.data();
      console.log('Name:', data.name, 'displayName:', data.displayName);
      console.log('Email:', data.email);
      console.log('Class ID:', data.classId);
      console.log('Batch ID:', data.batchId);
      console.log('Class IDs:', data.classIds);
      console.log('Batch IDs:', data.batchIds);
      console.log('Role:', data.role);
    });

    console.log('Querying staff collection...');
    const staffSnap = await getDocs(query(collection(db, 'staff'), where('role', '==', 'play_school_incharge')));
    console.log('Found play_school_incharge staff:', staffSnap.size);
    staffSnap.forEach(doc => {
      console.log('Staff ID:', doc.id);
      const data = doc.data();
      console.log('Name:', data.name);
      console.log('Email:', data.email);
      console.log('Class ID:', data.classId);
      console.log('Batch ID:', data.batchId);
      console.log('Class IDs:', data.classIds);
      console.log('Batch IDs:', data.batchIds);
      console.log('Role:', data.role);
    });

    console.log('Querying classes...');
    const classesSnap = await getDocs(collection(db, 'classes'));
    console.log('Total classes:', classesSnap.size);
    classesSnap.forEach(doc => {
      console.log(`Class: ID=${doc.id}, Name=${doc.data().name}`);
    });

    console.log('Querying batches...');
    const batchesSnap = await getDocs(collection(db, 'batches'));
    console.log('Total batches:', batchesSnap.size);
    batchesSnap.forEach(doc => {
      console.log(`Batch: ID=${doc.id}, Name=${doc.data().name}, ClassID=${doc.data().classId}, ClassTeacherID=${doc.data().classTeacherId}`);
    });

  } catch (err: any) {
    console.error('Error running query:', err);
  }
}

run().then(() => process.exit(0));

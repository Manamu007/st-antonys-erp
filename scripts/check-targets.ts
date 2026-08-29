import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function checkEmails() {
  const targetEmails = ['kala123@gmail.com', 'asha@gmail.com'];
  const collections = ['staff', 'users', 'batches', 'attendance', 'leaves', 'timetables', 'salary'];

  console.log('=== Locating "kala123@gmail.com" and "asha@gmail.com" in antony-database1 ===');

  for (const coll of collections) {
    try {
      const snap = await getDocs(collection(db, coll));
      snap.forEach(d => {
        const data = d.data();
        const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
        for (const email of targetEmails) {
          if (str.includes(email.toLowerCase())) {
            console.log(`\n[Found in collection '${coll}' with ID: ${d.id}]:`);
            console.log(JSON.stringify({ id: d.id, ...data }, null, 2));
          }
        }
      });
    } catch (e: any) {
      // ignore
    }
  }

  process.exit(0);
}

checkEmails().catch(console.error);

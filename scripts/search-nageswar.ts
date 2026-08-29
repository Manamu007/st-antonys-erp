import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function searchAllForNageswar() {
  const colls = ['attendance', 'audit_logs', 'staff', 'batches', 'classes', 'leaves', 'timetables'];
  for (const collName of colls) {
    try {
      const snap = await getDocs(collection(db, collName));
      console.log(`Checking ${collName} (${snap.size} docs)...`);
      snap.forEach(d => {
        const str = JSON.stringify(d.data()).toLowerCase();
        if (str.includes('nages') || str.includes('nagi') || str.includes('balaiah')) {
          console.log(`FOUND in ${collName} [${d.id}]:`, d.data());
        }
      });
    } catch (e: any) {
      console.log(`Error in ${collName}:`, e.message);
    }
  }
  process.exit(0);
}

searchAllForNageswar().catch(console.error);

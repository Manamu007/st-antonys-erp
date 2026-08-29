import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || 'antony-database1');

async function inspectAndFixStantonys() {
  console.log("=== INSPECTING ALL COLLECTIONS FOR stantonys9m@gmail.com ===");

  const collections = ['users', 'students', 'staff', 'teachers', 'employees'];

  for (const col of collections) {
    try {
      const snap = await getDocs(collection(db, col));
      console.log(`\n📁 Collection '${col}': (${snap.size} docs)`);
      snap.forEach(d => {
        const data = d.data();
        const email = (data.email || '').toLowerCase();
        const id = d.id.toLowerCase();
        if (email.includes('stantonys9m') || id.includes('stantonys9m')) {
          console.log(`  - Doc ID: ${d.id}`);
          console.log(`    Data:`, JSON.stringify(data));
        }
      });
    } catch (e: any) {
      console.error(`Error reading ${col}:`, e.message);
    }
  }

  process.exit(0);
}

inspectAndFixStantonys();

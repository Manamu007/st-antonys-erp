import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || 'antony-database1');

async function fastSearch() {
  const email = "stantonys9m@gmail.com";
  const name = "Stantonys9m";

  console.log(`\n🔍 DEEP SEARCH IN FIRESTORE DATABASE (${config.firestoreDatabaseId}):`);
  console.log(`Target Email: ${email}`);
  console.log(`Target Name: ${name}\n`);

  const cols = ['users', 'staff', 'teachers', 'students', 'batches', 'classes', 'attendance', 'leaves', 'homework'];

  let grandTotal = 0;

  for (const col of cols) {
    try {
      const snap = await getDocs(collection(db, col));
      const matches: any[] = [];

      snap.forEach(d => {
        const data = d.data();
        const str = JSON.stringify(data).toLowerCase();
        const idStr = d.id.toLowerCase();

        if (str.includes(email.toLowerCase()) || str.includes(name.toLowerCase()) || idStr.includes("stantonys9m")) {
          matches.push({
            documentId: d.id,
            name: data.name || data.displayName || data.studentName || 'N/A',
            email: data.email || 'N/A',
            role: data.role || data.designation || 'N/A',
            classId: data.classId || 'N/A',
            batchId: data.batchId || 'N/A'
          });
        }
      });

      console.log(`📁 Collection '${col}': Found ${matches.length} matching record(s)`);
      if (matches.length > 0) {
        matches.forEach(m => console.log(`   - ID: ${m.documentId} | Name: ${m.name} | Email: ${m.email} | Role: ${m.role}`));
      }
      grandTotal += matches.length;
    } catch (e: any) {
      console.log(`📁 Collection '${col}': Error (${e.message})`);
    }
  }

  console.log(`\n==========================================`);
  console.log(`TOTAL MATCHING RECORDS IN DATABASE: ${grandTotal}`);
  console.log(`==========================================\n`);
  process.exit(0);
}

fastSearch();

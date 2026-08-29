import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || 'antony-database1');

const collectionsToSearch = [
  'users',
  'students',
  'staff',
  'teachers',
  'batches',
  'classes',
  'attendance',
  'attendance_history',
  'leaves',
  'homework',
  'certificates',
  'fees',
  'fee_collections',
  'fee_concessions',
  'notices',
  'events',
  'timetables',
  'timetable',
  'exams',
  'marks',
  'outings',
  'hostel_students',
  'library_books',
  'library_issues',
  'routes',
  'drivers'
];

async function runDeepSearch() {
  console.log("=== DEEP SEARCH FOR Stantonys9m / Stantonys9m@gmail.com ===");
  const targetEmail = "stantonys9m@gmail.com";
  const targetName = "stantonys9m";

  let totalMatches = 0;
  const matchDetails: any[] = [];

  for (const colName of collectionsToSearch) {
    try {
      const snap = await getDocs(collection(db, colName));
      let countInCol = 0;

      snap.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        const jsonStr = JSON.stringify(data).toLowerCase();
        const idLower = id.toLowerCase();

        const matchesEmail = jsonStr.includes(targetEmail) || idLower.includes(targetEmail);
        const matchesName = jsonStr.includes(targetName) || idLower.includes(targetName);

        if (matchesEmail || matchesName) {
          countInCol++;
          totalMatches++;
          matchDetails.push({
            collection: colName,
            id: docSnap.id,
            matchedByEmail: matchesEmail,
            matchedByName: matchesName,
            data: {
              name: data.name || data.displayName || data.studentName || data.classTeacherName || data.teacherName,
              email: data.email || data.classTeacherEmail || data.teacherEmail || data.parentEmail,
              role: data.role || data.designation || data.type,
              classId: data.classId || data.className,
              batchId: data.batchId || data.batchName,
              id: docSnap.id
            }
          });
        }
      });

      console.log(`Collection '${colName}': found ${countInCol} matching record(s).`);
    } catch (err: any) {
      console.log(`Collection '${colName}': could not fetch (${err.message})`);
    }
  }

  console.log("\n================ RESULTS SUMMARY ================");
  console.log(`TOTAL MATCHING RECORDS FOUND: ${totalMatches}`);
  console.log("DETAILS:", JSON.stringify(matchDetails, null, 2));
}

runDeepSearch().catch(console.error);

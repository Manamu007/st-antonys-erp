import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, '(default)');

async function analyzeAllStudentsStatuses() {
  console.log("Analyzing all student statuses in Firestore...");
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  console.log(`Total students in collection 'students': ${all.length}`);

  const statusValues: Record<string, number> = {};
  const classesSummary: Record<string, { active: number; inactive: number; non_attending: number; other: number; otherStatuses: string[] }> = {};

  const normalizeStudentStatus = (status?: any): 'active' | 'inactive' | 'non_attending' => {
    if (!status) return 'active';
    const clean = String(status).toLowerCase().trim().replace(/[- ]/g, '_');
    if (clean === 'non_attending' || clean === 'nonattending') return 'non_attending';
    if (
      clean === 'inactive' ||
      clean === 'dropped' ||
      clean === 'tc_issued' ||
      clean === 'withdrawn' ||
      clean === 'left' ||
      clean === 'archived' ||
      clean === 'deleted' ||
      clean.includes('inactive') ||
      clean.includes('dropped') ||
      clean.includes('tc_issued')
    ) {
      return 'inactive';
    }
    return 'active';
  };

  const sampleNonAttending: any[] = [];
  const sampleInactive: any[] = [];
  const unclassified: any[] = [];

  all.forEach(s => {
    const rawStatus = s.status;
    const statusKey = rawStatus === undefined ? 'undefined' : rawStatus === null ? 'null' : String(rawStatus);
    statusValues[statusKey] = (statusValues[statusKey] || 0) + 1;

    const norm = normalizeStudentStatus(rawStatus);

    const cName = s.className || s.class || s.classId || 'Unknown';
    if (!classesSummary[cName]) {
      classesSummary[cName] = { active: 0, inactive: 0, non_attending: 0, other: 0, otherStatuses: [] };
    }

    if (norm === 'active') classesSummary[cName].active++;
    else if (norm === 'inactive') {
      classesSummary[cName].inactive++;
      if (sampleInactive.length < 15) sampleInactive.push({ id: s.id, name: s.name, class: cName, batch: s.batch || s.batchId, status: s.status, reason: s.inactiveReason || s.dropReason });
    }
    else if (norm === 'non_attending') {
      classesSummary[cName].non_attending++;
      if (sampleNonAttending.length < 15) sampleNonAttending.push({ id: s.id, name: s.name, class: cName, batch: s.batch || s.batchId, status: s.status, roll: s.rollNumber });
    }

    // Check other status indicators
    if (s.isActive === false || s.is_active === false || s.nonAttending === true || s.isNonAttending === true || s.attendanceStatus === 'non_attending') {
      unclassified.push({
        id: s.id,
        name: s.name,
        class: cName,
        status: s.status,
        isActive: s.isActive,
        is_active: s.is_active,
        nonAttending: s.nonAttending,
        isNonAttending: s.isNonAttending,
        attendanceStatus: s.attendanceStatus
      });
    }
  });

  console.log("\n=== RAW STATUS FIELD VALUE COUNTS ===");
  console.table(statusValues);

  console.log("\n=== STATUS BREAKDOWN BY CLASS ===");
  console.table(classesSummary);

  console.log(`\n=== SAMPLE NON-ATTENDING STUDENTS (${sampleNonAttending.length}) ===`);
  sampleNonAttending.forEach(s => console.log(`  - [${s.id}] ${s.name} (${s.class} / ${s.batch}) - Status: "${s.status}" - Roll: ${s.roll}`));

  console.log(`\n=== SAMPLE INACTIVE STUDENTS (${sampleInactive.length}) ===`);
  sampleInactive.forEach(s => console.log(`  - [${s.id}] ${s.name} (${s.class} / ${s.batch}) - Status: "${s.status}"`));

  if (unclassified.length > 0) {
    console.log(`\n=== STUDENTS WITH SECONDARY STATUS FIELDS (isActive/nonAttending/etc): ${unclassified.length} ===`);
    unclassified.forEach(s => console.log(s));
  } else {
    console.log("\nNo students found with conflicting secondary boolean status fields.");
  }

  process.exit(0);
}

analyzeAllStudentsStatuses().catch(console.error);

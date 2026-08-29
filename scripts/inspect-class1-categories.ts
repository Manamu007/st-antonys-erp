import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectAllClass1History() {
  const studentsSnap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  studentsSnap.forEach(d => all.push({ id: d.id, ...d.data() }));

  // All students where class or batch or classId or batchId mentions "1 Class" or "1_Class"
  const class1All = all.filter(s => {
    const str = `${s.id} ${s.class} ${s.className} ${s.classId} ${s.batch} ${s.batchName} ${s.batchId}`.toLowerCase();
    return str.includes('1 class') || str.includes('1_class');
  });

  console.log(`Total students mentioning 1 Class: ${class1All.length}`);

  // Let's categorize them by their exact doc fields
  const categories: Record<string, any[]> = {};
  class1All.forEach(s => {
    const key = `class: "${s.class || s.className || ''}" | classId: "${s.classId || ''}" | batch: "${s.batch || s.batchName || ''}" | batchId: "${s.batchId || ''}" | status: "${s.status || ''}"`;
    categories[key] = categories[key] || [];
    categories[key].push(s);
  });

  console.log('\nCategories of 1 Class students:');
  Object.entries(categories).forEach(([k, list]) => {
    console.log(`[Count: ${list.length}] -> ${k}`);
  });

  fs.writeFileSync('./class1_categories.json', JSON.stringify(categories, null, 2));
  process.exit(0);
}

inspectAllClass1History().catch(console.error);

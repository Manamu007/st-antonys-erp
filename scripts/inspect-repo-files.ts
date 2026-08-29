import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectAllStudentsInDetail() {
  const snap = await getDocs(collection(db, 'students'));
  const all: any[] = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));

  console.log(`Loaded ${all.length} students from DB.`);

  // Let's find any other files or backups in the repo
  const repoFiles = fs.readdirSync('.').filter(f => f.endsWith('.json') || f.endsWith('.csv') || f.endsWith('.ts'));
  console.log('Repo files:', repoFiles);

  process.exit(0);
}

inspectAllStudentsInDetail().catch(console.error);

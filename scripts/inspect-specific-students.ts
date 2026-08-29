import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function inspectStudentDocs() {
  const ids = [
    'dhruthika_b_91630211',
    'jyothirmayi_c_91944211',
    'nandhini_b_91996411',
    'nivedha_s_91939811',
    'pravalika_d_91628211',
    'rama_shanvika_g_9183111',
    'sree_shanvitha_s_91949311',
    'venkata_mokshith_y_91939811',
    'venkata_thanush_k_91630511',
    'vijaya_k_91939911',
    'yashwitha_k_91966411',
    'sushanth_krishna_m_91630411',
    'suhash_g_91996711',
    'venkata_rithvik_m_91939911'
  ];

  for (const id of ids) {
    const snap = await getDocs(collection(db, 'students'));
    const doc = snap.docs.find(d => d.id === id);
    if (doc) {
      console.log(`\nDoc ID: ${id}`);
      console.log(doc.data());
    }
  }

  process.exit(0);
}

inspectStudentDocs().catch(console.error);

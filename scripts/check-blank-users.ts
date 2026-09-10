import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, '(default)');

const targetIds = [
  'MaeIRGhcL6OkFOob251bTDnN0R53', // Anil Babu
  'p2Vp79bOrHMNOveOApuDSwtGoRH2', // Bala Guravaiah (Balaiah)
  'gl583IWdnSSgIdsou5PqE4VCK0o1',
  'MimTTIMM4oSFgEvozkqgiviQ2lH3',
  '4m34rfgCg7OsBdFO0oospNOxRmg1',
  '2QIY48vJRQTFYXB0Mp5K78gTtmX2',
  '3nbcrtmrwnZ6leRoLDqM9ipwqpF3',
  'qiMotRrtDGUWhouc54Ghp12AXBi1',
  'kdrdArL1yDegTx1sOP3nm8j7B662',
  '3mxkgpJ39SXz6XOS3vUCDOOkAED2',
  '8MGOpKlP6ENGFKgW7rIZ8QJ6tg22'
];

async function checkSpecificUserDocs() {
  for (const id of targetIds) {
    const userDoc = await getDoc(doc(db, 'users', id));
    const staffDoc = await getDoc(doc(db, 'staff', id));
    console.log(`\n=== ID: ${id} ===`);
    console.log('USER:', userDoc.exists() ? userDoc.data() : 'NOT_FOUND');
    console.log('STAFF:', staffDoc.exists() ? staffDoc.data() : 'NOT_FOUND');
  }
  process.exit(0);
}

checkSpecificUserDocs().catch(console.error);

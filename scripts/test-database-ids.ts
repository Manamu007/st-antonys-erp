import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);

async function checkDbs() {
  const dbIds = ['antony-database1', '(default)'];
  for (const dbId of dbIds) {
    console.log(`\n=== Testing dbId: ${dbId} ===`);
    try {
      const db = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);
      const staffSnap = await getDocs(collection(db, 'staff'));
      console.log(`Db [${dbId}] staff docs: ${staffSnap.size}`);
      
      const matched: any[] = [];
      staffSnap.forEach(d => {
        const data = d.data();
        const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
        if (str.includes('anil') || str.includes('bala') || str.includes('nages') || str.includes('babu') || str.includes('reddy')) {
          matched.push({ id: d.id, name: data.name, email: data.email, phone: data.phone || data.whatsappNumber, role: data.role });
        }
      });
      console.log(`Matched ${matched.length} staff records in db [${dbId}]:`, matched);

      // Check users collection
      const usersSnap = await getDocs(collection(db, 'users'));
      console.log(`Db [${dbId}] total users: ${usersSnap.size}`);
      const matchedUsers: any[] = [];
      usersSnap.forEach(d => {
        const data = d.data();
        const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
        if (str.includes('anil') || str.includes('bala') || str.includes('nages') || str.includes('8074572283')) {
          matchedUsers.push({ id: d.id, name: data.name, email: data.email, phone: data.phone || data.whatsappNumber, role: data.role, isDeleted: data.isDeleted });
        }
      });
      console.log(`Matched ${matchedUsers.length} user records:`, matchedUsers);

      // Check leaves
      const leavesSnap = await getDocs(collection(db, 'leaves'));
      console.log(`Db [${dbId}] total leaves: ${leavesSnap.size}`);
      leavesSnap.forEach(d => {
        const data = d.data();
        const str = JSON.stringify({ id: d.id, ...data }).toLowerCase();
        if (str.includes('anil') || str.includes('bala') || str.includes('nages') || str.includes('8074572283')) {
          console.log(`Leave record [${d.id}]:`, data);
        }
      });

    } catch (e: any) {
      console.error(`Error with dbId ${dbId}:`, e.message);
    }
  }
  process.exit(0);
}

checkDbs().catch(console.error);

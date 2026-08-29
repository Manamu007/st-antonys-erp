import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function dumpDirect() {
  const staffSnap = await getDocs(collection(db, 'staff'));
  const staffList: any[] = [];
  staffSnap.forEach(d => staffList.push({ id: d.id, ...d.data() }));

  const usersSnap = await getDocs(collection(db, 'users'));
  const usersList: any[] = [];
  usersSnap.forEach(d => {
    const data = d.data();
    if (data.role !== 'student') {
      usersList.push({ id: d.id, ...data });
    }
  });

  const leavesSnap = await getDocs(collection(db, 'leaves'));
  const leavesList: any[] = [];
  leavesSnap.forEach(d => leavesList.push({ id: d.id, ...d.data() }));

  const result = {
    staffCount: staffList.length,
    usersNonStudentCount: usersList.length,
    leavesCount: leavesList.length,
    staff: staffList,
    usersNonStudent: usersList,
    leaves: leavesList
  };

  fs.writeFileSync('./teachers_dump.json', JSON.stringify(result, null, 2));
  console.log('Successfully wrote ./teachers_dump.json');
  process.exit(0);
}

dumpDirect().catch(console.error);

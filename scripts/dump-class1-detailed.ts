import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'antony-database1');

async function dumpClass1Detailed() {
  const snap = await getDocs(collection(db, 'students'));
  const list: any[] = [];
  
  snap.forEach(d => {
    const data = d.data();
    const cId = String(data.classId || '');
    const cName = String(data.class || data.className || '');
    const bId = String(data.batchId || '');
    const bName = String(data.batch || data.batchName || '');
    
    if (cId === '1_Class_Class' || cName === '1 Class' || bId.includes('1 Class') || bName.includes('1 Class') || bId.includes('1_Class')) {
      list.push({
        id: d.id,
        name: data.name || `${data.firstName || ''} ${data.secondName || ''}`.trim(),
        roll: data.rollNumber || data.rollNo || '',
        classId: cId,
        className: cName,
        batchId: bId,
        batchName: bName,
        status: data.status || 'active',
        father: data.fatherName || data.parentName || '',
        phone: data.mobileNumber || data.phone || '',
        academicYear: data.academicYear || '',
        feeType: data.feeType || '',
        discountReason: data.discountReason || '',
        concession: data.concession || '',
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || ''
      });
    }
  });

  // Sort by batch and roll
  list.sort((a, b) => {
    if (a.batchId !== b.batchId) return a.batchId.localeCompare(b.batchId);
    const rA = parseInt(a.roll) || 0;
    const rB = parseInt(b.roll) || 0;
    return rA - rB;
  });

  console.log(`Total 1 Class associated records in DB: ${list.length}`);
  fs.writeFileSync('./class1_students_dump.json', JSON.stringify(list, null, 2));
  console.log('Saved to class1_students_dump.json');
  process.exit(0);
}

dumpClass1Detailed().catch(console.error);

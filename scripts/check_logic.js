import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const normalizeYear = (y) => {
  if (!y) return '';
  return y.replace(/\s+/g, '').replace(/-20(\d{2})$/, '-$1');
};

const normalize = (n) => {
  if (!n) return '';
  const romanMap = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
  };
  
  let processed = n.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, (match) => romanMap[match] || match)
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  
  return processed
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('');
};

async function main() {
  const usersPath = collection(db, "users");
  
  // Actually we can't query users efficiently without a key or just list users
  // We'll read classes and feeStructures
  const classesRes = await getDocs(collection(db, "classes"));
  const classes = classesRes.docs.map(d=>({id: d.id, ...d.data()}));
  
  const structuresRes = await getDocs(collection(db, "feeStructures"));
  const feeStructures = structuresRes.docs.map(d=>({id:d.id, ...d.data()}));

  // Mock Freddy Spears
  const student = {
    classId: "someClassId", // We don't know the actual classId without reading user
  };

  for (const c of classes) {
    student.classId = c.id;
    const sNorm = normalize(c.name);
    console.log(`Trying class: ${c.name} (${sNorm})`);
    
    let schoolStructure = feeStructures.find(s => s.type==='school' && normalizeYear(s.academicYear) === '2026-27' && (sNorm === normalize(s.name) || normalize(s.name).includes(sNorm) || sNorm.includes(normalize(s.name))));
    console.log("  Matched: ", schoolStructure ? `${schoolStructure.name} (${schoolStructure.academicYear})` : 'NONE');
  }
}
main().catch(console.error);

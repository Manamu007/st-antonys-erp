import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  console.log("=== FIXING ACADEMIC YEARS IN DB ===");
  try {
    const q1 = query(collection(db, "students"), where("academicYear", "==", "2026-2027"));
    const studentsSnap = await getDocs(q1);
    console.log(`Found ${studentsSnap.size} students with academicYear '2026-2027'...`);
    
    let updatedCount = 0;
    for (const d of studentsSnap.docs) {
      const data = d.data();
      const currentYear = data.academicYear;
      
      console.log(`Fixing student ${data.name || d.id}: "${currentYear}" -> "2026-27"`);
      await updateDoc(doc(db, "students", d.id), {
        academicYear: "2026-27"
      });
      updatedCount++;
    }
    
    // Also check Freddy Spears specifically, just in case
    const q2 = query(collection(db, "students"), where("name", "==", "Freddy Spears"));
    const freddySnap = await getDocs(q2);
    for (const d of freddySnap.docs) {
      const data = d.data();
      if (data.academicYear !== "2026-27") {
        console.log(`Fixing specific Freddy Spears record ${d.id}: "${data.academicYear}" -> "2026-27"`);
        await updateDoc(doc(db, "students", d.id), {
          academicYear: "2026-27"
        });
        updatedCount++;
      }
    }
    
    console.log(`\n=== SUCCESS: Fixed ${updatedCount} students' academic Year! ===`);
  } catch (err) {
    console.error("Error during academic year fix:", err);
  }
}

main();


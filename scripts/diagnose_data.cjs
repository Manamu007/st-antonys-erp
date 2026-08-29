const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const config = require("../firebase-applet-config.json");

// Initialize Admin SDK
admin.initializeApp({
  projectId: config.projectId
});

const db = getFirestore(admin.app(), config.firestoreDatabaseId || "(default)");

async function main() {
  console.log("=== DIAGNOSING DATABASE RECORDS ===");
  try {
    // 1. Fetch Freddy's student document(s)
    const studentsSnap = await db.collection("students").get();
    const students = [];
    studentsSnap.forEach(doc => {
      const data = doc.data();
      if (doc.id.toLowerCase().includes("freddy") || (data.name && data.name.toLowerCase().includes("freddy"))) {
        students.push({ id: doc.id, ...data });
      }
    });
    console.log(`\nFound ${students.length} students matching "Freddy":`);
    console.log(JSON.stringify(students, null, 2));

    if (students.length === 0) {
      console.log("\nListing first 5 students in database as fallback:");
      const firstFive = [];
      const firstFiveSnap = await db.collection("students").limit(5).get();
      firstFiveSnap.forEach(doc => firstFive.push({ id: doc.id, ...doc.data() }));
      console.log(JSON.stringify(firstFive, null, 2));
    }

    // 2. Fetch Fee Structures
    const fsSnap = await db.collection("feeStructures").get();
    const structures = [];
    fsSnap.forEach(doc => structures.push({ id: doc.id, ...doc.data() }));
    console.log(`\nFound ${structures.length} Fee Structures:`);
    console.log(JSON.stringify(structures, null, 2));

    // 3. Fetch Concessions
    const concSnap = await db.collection("concessions").get();
    const concessions = [];
    concSnap.forEach(doc => concessions.push({ id: doc.id, ...doc.data() }));
    console.log(`\nFound ${concessions.length} Concessions:`);
    console.log(JSON.stringify(concessions, null, 2));

    // 4. If we found a Freddy, let's fetch his fees and payments
    if (students.length > 0) {
      const targetId = students[0].id;
      
      const feesSnap = await db.collection("fees").where("studentId", "==", targetId).get();
      const studentFees = [];
      feesSnap.forEach(doc => studentFees.push({ id: doc.id, ...doc.data() }));
      console.log(`\nFees records for student ${targetId}:`);
      console.log(JSON.stringify(studentFees, null, 2));

      const pmtsSnap = await db.collection("payments").where("studentId", "==", targetId).get();
      const studentPmts = [];
      pmtsSnap.forEach(doc => studentPmts.push({ id: doc.id, ...doc.data() }));
      console.log(`\nPayment records for student ${targetId}:`);
      console.log(JSON.stringify(studentPmts, null, 2));
    }

  } catch (error) {
    console.error("Error executing diagnosis:", error);
  }
}

main();

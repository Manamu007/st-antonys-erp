const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const config = require("../firebase-applet-config.json");

// Mock or require the calculation function
const { calculateStudentFee } = require("../src/lib/feeUtils.ts");

// Initialize Admin SDK
admin.initializeApp({
  projectId: config.projectId
});

const db = getFirestore(admin.app(), config.firestoreDatabaseId || "(default)");

async function main() {
  try {
    // Fetch collections
    const fsSnap = await db.collection("feeStructures").get();
    const feeStructures = [];
    fsSnap.forEach(doc => feeStructures.push({ id: doc.id, ...doc.data() }));

    const concSnap = await db.collection("concessions").get();
    const concessions = [];
    concSnap.forEach(doc => concessions.push({ id: doc.id, ...doc.data() }));

    const classesSnap = await db.collection("classes").get();
    const classes = [];
    classesSnap.forEach(doc => classes.push({ id: doc.id, ...doc.data() }));

    const batchesSnap = await db.collection("batches").get();
    const batches = [];
    batchesSnap.forEach(doc => batches.push({ id: doc.id, ...doc.data() }));

    // Get Freddy
    const studentsSnap = await db.collection("students").get();
    let freddy = null;
    studentsSnap.forEach(doc => {
      const data = doc.data();
      if (doc.id.toLowerCase().includes("freddy") || (data.name && data.name.toLowerCase().includes("freddy"))) {
        freddy = { id: doc.id, ...data };
      }
    });

    if (freddy) {
      console.log("\n=== RUNNING SIMULATED CALCULATION ===");
      const calcResult = calculateStudentFee(
        freddy,
        freddy.academicYear || "2026-27",
        feeStructures,
        concessions,
        classes,
        batches,
        true // isAdmin
      );
      console.log("CALCULATION RESULT:");
      console.log(JSON.stringify(calcResult, null, 2));
    } else {
      console.log("Freddy not found.");
    }
  } catch (err) {
    console.error(err);
  }
}
main();

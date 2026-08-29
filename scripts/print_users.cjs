const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const config = require("../firebase-applet-config.json");

admin.initializeApp({
  projectId: config.projectId
});

const db = getFirestore(admin.app(), config.firestoreDatabaseId || "(default)");

async function main() {
  try {
    const usersSnap = await db.collection("users").get();
    let freddyUser = null;
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (doc.id.toLowerCase().includes("freddy") || (data.name && data.name.toLowerCase().includes("freddy"))) {
        freddyUser = { id: doc.id, ...data };
      }
    });

    console.log("=== FREDDY USER IN 'users' ===");
    console.log(JSON.stringify(freddyUser, null, 2));

    const studentDoc = await db.collection("students").doc("freddy_spears_m_91882211").get();
    console.log("\n=== FREDDY STUDENT IN 'students' ===");
    console.log(JSON.stringify(studentDoc.data(), null, 2));

    // List all fees count & first 3
    const feesSnap = await db.collection("fees").get();
    console.log(`\nTotal Fees records in db: ${feesSnap.size}`);
    const firstFees = [];
    let count = 0;
    feesSnap.forEach(doc => {
      if (count < 3) {
        firstFees.push({ id: doc.id, ...doc.data() });
        count++;
      }
    });
    console.log("Fees Sample:", JSON.stringify(firstFees, null, 2));

    // List all payments count & first 3
    const paymentsSnap = await db.collection("payments").get();
    console.log(`\nTotal Payments records in db: ${paymentsSnap.size}`);
    const firstPayments = [];
    let pcount = 0;
    paymentsSnap.forEach(doc => {
      if (pcount < 3) {
        firstPayments.push({ id: doc.id, ...doc.data() });
        pcount++;
      }
    });
    console.log("Payments Sample:", JSON.stringify(firstPayments, null, 2));

  } catch (err) {
    console.error(err);
  }
}
main();

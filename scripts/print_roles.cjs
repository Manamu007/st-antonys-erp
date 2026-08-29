const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const config = require("../firebase-applet-config.json");

admin.initializeApp({
  projectId: config.projectId
});

const db = getFirestore(admin.app(), config.firestoreDatabaseId || "(default)");

async function main() {
  try {
    const snap = await db.collection("roles").get();
    console.log("=== ROLES IN DATABASE ===");
    snap.forEach(doc => {
      console.log(`Role: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error(err);
  }
}
main();

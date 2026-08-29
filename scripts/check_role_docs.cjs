const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const config = require("../firebase-applet-config.json");

admin.initializeApp({
  projectId: config.projectId
});

const db = getFirestore(admin.app(), config.firestoreDatabaseId || "(default)");

async function main() {
  try {
    const studentDoc = await db.collection("roles").doc("student").get();
    console.log("=== ROLE STUDENT DOC ===");
    if (studentDoc.exists) {
      console.log(JSON.stringify(studentDoc.data(), null, 2));
    } else {
      console.log("No 'student' role document exists in Firestore!");
    }

    const parentDoc = await db.collection("roles").doc("parent").get();
    console.log("\n=== ROLE PARENT DOC ===");
    if (parentDoc.exists) {
      console.log(JSON.stringify(parentDoc.data(), null, 2));
    } else {
      console.log("No 'parent' role document exists in Firestore!");
    }
  } catch (err) {
    console.error(err);
  }
}
main();

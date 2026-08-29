import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  const c = await getDoc(doc(db, "feeStructures", "fs_school_Class_I_1777456652867"));
  console.log("Class I struct:", c.data());
}
main().catch(console.error);

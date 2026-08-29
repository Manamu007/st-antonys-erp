import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  const fees = await getDocs(collection(db, "feeStructures"));
  console.log("STRUCTURES:", fees.docs.map(d => ({id:d.id, year: d.data().academicYear})));
}
main();

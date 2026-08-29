import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  const fees = await getDocs(collection(db, "fees"));
  console.log("FEES:", fees.docs.map(d => ({id:d.id, ...d.data()})));
  
  const siteConfig = await getDoc(doc(db, "siteConfig", "settings"));
  console.log("SETTINGS:", siteConfig.data());
}
main();

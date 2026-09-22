import { getMongoDb } from './src/server/mongoSession.js';

async function run() {
  const mongo = await getMongoDb().catch(() => null);
  if (!mongo) {
    console.error("Could not connect to MongoDB!");
    process.exit(1);
  }
  console.log("Connected to MongoDB successfully!");
  const collections = ['students', 'users', 'staff', 'classes', 'batches', 'subjects', 'exams', 'examMarks'];
  for (const name of collections) {
    const col = mongo.collection(name);
    const total = await col.countDocuments({});
    const active = await col.countDocuments({ status: { $ne: 'deleted' } });
    console.log(`Collection: ${name} | Total: ${total} | Active (not deleted): ${active}`);
  }
  process.exit(0);
}

run().catch(console.error);

import { getDbAdmin, initializationPromise } from './server/firebaseAdmin.js';

async function main() {
  try {
    await initializationPromise;
    const db = getDbAdmin();
    const flowsSnap = await db.collection('whatsapp_bot_flows').get();
    console.log(`=== FOUND ${flowsSnap.size} FLOWS ===`);
    flowsSnap.forEach((doc) => {
      const data = doc.data();
      console.log(`Flow ID: ${doc.id}`);
      console.log(`Name: ${data.name}`);
      console.log(`IsActive: ${data.isActive}`);
      console.log(`Nodes:`, (data.nodes || []).map((n: any) => ({ id: n.id, type: n.type, text: n.data?.text || n.data?.title || '' })));
      console.log(`Edges:`, (data.edges || []).map((e: any) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle })));
      console.log('------------------------------------');
    });
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();

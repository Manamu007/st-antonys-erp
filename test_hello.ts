import { getSmartBotResponse } from './src/server/aiBotService.js';
import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function test() {
  console.log("Initializing...");
  await initializationPromise;
  
  const query = "who is the vice principal?";
  const context = JSON.stringify({ 
    userId: "Y0UaMylnStN8yR3W2r10z5G6aB32",
    userName: "Admin User",
    userRole: "admin",
    whatsappNumber: "919440989858"
  });

  console.log("Calling Smart Bot...");
  const response = await getSmartBotResponse(query, context);
  console.log("Response Type:", typeof response);
  console.log("Final Response:");
  console.log("-------------------");
  console.log(response);
  console.log("-------------------");
  process.exit(0);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});

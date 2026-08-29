import { getDbAdmin, initializationPromise } from './src/server/firebaseAdmin.js';

async function run() {
  await initializationPromise;
  const db = getDbAdmin();
  
  const id = 'Y2h3YtgYXMc7LAqQSnCVbaIQHU22';
  const userDoc = await db.collection('users').doc(id).get();
  const staffDoc = await db.collection('staff').doc(id).get();
  
  console.log('--- USER DOC ---');
  if (userDoc.exists) {
    console.log(JSON.stringify(userDoc.data(), null, 2));
  } else {
    console.log('User doc does not exist');
  }
  
  console.log('--- STAFF DOC ---');
  if (staffDoc.exists) {
    console.log(JSON.stringify(staffDoc.data(), null, 2));
  } else {
    console.log('Staff doc does not exist');
  }
}
run();

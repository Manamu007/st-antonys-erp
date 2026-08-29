import { initializationPromise, getDbAdmin } from './src/server/firebaseAdmin.js';

async function fix() {
  await initializationPromise;
  const db = getDbAdmin();
  await db.collection('settings').doc('school').update({
    academicYears: ['2023-2024', '2024-2025', '2025-2026', '2026-2027'],
    currentAcademicYear: '2026-2027'
  });
  console.log("Updated settings");
}

fix().catch(console.error);

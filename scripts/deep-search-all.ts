import { dbService } from '../src/services/dbService';

async function deepSearchAllCollections() {
  const allPossibleCollections = [
    'staff', 'users', 'batches', 'classes', 'leaves', 'teachers', 'students',
    'timetables', 'attendance', 'messages', 'conversations', 'notifications',
    'audit_logs', 'logs', 'subjects', 'deleted', 'archived', 'trash',
    'system_settings', 'settings', 'face_descriptors', 'biometric'
  ];

  const queries = ['anil', 'babu', 'balaiah', 'balayya', 'nageswar', 'nagesh', '8074572283'];

  for (const coll of allPossibleCollections) {
    try {
      const items = await dbService.list(coll) || [];
      if (items.length === 0) continue;
      const matched = items.filter((item: any) => {
        const str = JSON.stringify(item).toLowerCase();
        return queries.some(q => str.includes(q));
      });
      if (matched.length > 0) {
        console.log(`\n=== Found ${matched.length} in collection '${coll}' ===`);
        matched.forEach(m => {
          console.log(`[${m.id || m.uid}] =>`, JSON.stringify(m).slice(0, 300));
        });
      }
    } catch (e: any) {
      // collection may not exist
    }
  }

  process.exit(0);
}

deepSearchAllCollections().catch(console.error);

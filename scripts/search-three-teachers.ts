import { dbService } from '../src/services/dbService';

async function searchTeachers() {
  console.log('Searching for Anil Babu, Balaiah, and Nageswar Reddy in database...');

  const searchQueries = ['anil', 'babu', 'balaiah', 'balayya', 'nageswar', 'nagesh', 'reddy'];
  const collections = ['staff', 'users', 'batches', 'classes', 'leaves', 'teachers'];

  for (const coll of collections) {
    try {
      const items = await dbService.list(coll) || [];
      console.log(`\n=== Collection [${coll}] (Total: ${items.length}) ===`);
      
      const matched = items.filter((item: any) => {
        const str = JSON.stringify(item).toLowerCase();
        return searchQueries.some(q => str.includes(q));
      });

      console.log(`Found ${matched.length} matches with keywords in '${coll}':`);
      matched.forEach((m: any, idx: number) => {
        console.log(`--- Match #${idx + 1} (${m.id || m.uid}) ---`);
        console.log({
          id: m.id || m.uid,
          name: m.name,
          displayName: m.displayName,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          phone: m.phone || m.whatsappNumber,
          role: m.role,
          designation: m.designation,
          status: m.status,
          department: m.department,
          isDeleted: m.isDeleted,
          hasDemoNameRemoved: m.hasDemoNameRemoved,
          isEditedByUser: m.isEditedByUser,
          classTeacher: m.classTeacher,
          classTeacherName: m.classTeacherName,
          classTeacherId: m.classTeacherId,
          classTeacherEmail: m.classTeacherEmail,
          className: m.className
        });
      });
    } catch (e: any) {
      console.error(`Error searching ${coll}:`, e.message);
    }
  }

  process.exit(0);
}

searchTeachers().catch(console.error);

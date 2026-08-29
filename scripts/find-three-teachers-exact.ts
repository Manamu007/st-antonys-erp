import { dbService } from '../src/services/dbService';

async function searchSpecificTeachers() {
  console.log('Searching specifically for Anil Babu, Balaiah, and Nageswar Reddy...');

  const staff = await dbService.list('staff') || [];
  const users = await dbService.list('users') || [];
  const leaves = await dbService.list('leaves') || [];
  const batches = await dbService.list('batches') || [];

  console.log('\n--- MATCHES IN STAFF ---');
  const staffMatches = staff.filter((s: any) => {
    const str = JSON.stringify(s).toLowerCase();
    return str.includes('anil') || str.includes('bala') || str.includes('nages') || str.includes('8074572283');
  });
  console.log(JSON.stringify(staffMatches, null, 2));

  console.log('\n--- MATCHES IN USERS (non-student) ---');
  const userMatches = users.filter((u: any) => {
    if (u.role === 'student') return false;
    const str = JSON.stringify(u).toLowerCase();
    return str.includes('anil') || str.includes('bala') || str.includes('nages') || str.includes('8074572283');
  });
  console.log(JSON.stringify(userMatches, null, 2));

  console.log('\n--- MATCHES IN LEAVES ---');
  const leaveMatches = leaves.filter((l: any) => {
    const str = JSON.stringify(l).toLowerCase();
    return str.includes('anil') || str.includes('bala') || str.includes('nages') || str.includes('8074572283');
  });
  console.log(JSON.stringify(leaveMatches, null, 2));

  // Let's also check all teaching staff in staff collection
  console.log('\n--- ALL TEACHING / CLASS TEACHER STAFF IN STAFF COLLECTION ---');
  const teachers = staff.filter((s: any) => 
    s.role?.includes('teacher') || 
    s.designation?.toLowerCase().includes('teacher') || 
    s.staffType === 'teaching'
  );
  teachers.forEach((t: any, i: number) => {
    console.log(`[${i + 1}] ID: ${t.id} | Name: "${t.name}" | First: "${t.firstName}" | Last: "${t.lastName}" | Phone: "${t.phone || t.whatsappNumber}" | Email: "${t.email}" | Role: "${t.role}" | Desig: "${t.designation}" | Batch: "${t.classTeacherBatchId || t.batchId || ''}" | isDeleted: ${t.isDeleted}`);
  });

  // Let's check non-teaching staff as well just in case they were categorized differently
  console.log('\n--- ALL NON-TEACHING STAFF IN STAFF COLLECTION ---');
  const nonTeachers = staff.filter((s: any) => 
    !s.role?.includes('teacher') && 
    !s.designation?.toLowerCase().includes('teacher') && 
    s.staffType !== 'teaching'
  );
  nonTeachers.forEach((t: any, i: number) => {
    console.log(`[${i + 1}] ID: ${t.id} | Name: "${t.name}" | Phone: "${t.phone || t.whatsappNumber}" | Email: "${t.email}" | Role: "${t.role}" | Desig: "${t.designation}"`);
  });

  process.exit(0);
}

searchSpecificTeachers().catch(console.error);

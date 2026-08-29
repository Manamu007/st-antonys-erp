import { dbService } from '../src/services/dbService';

async function checkTeachers() {
  const staff = (await dbService.list('staff')) || [];
  const users = (await dbService.list('users')) || [];
  const classes = (await dbService.list('classes')) || [];
  const batches = (await dbService.list('batches')) || [];
  const timetables = (await dbService.list('timetables')) || [];

  console.log('--- ALL STAFF RECORDS ---');
  staff.forEach((s: any) => {
    console.log(`Staff ID: ${s.id}, Name: ${s.name}, Email: ${s.email}, Role: ${s.role}, ClassId: ${s.classId}, ClassName: ${s.className}, BatchId: ${s.batchId}, BatchName: ${s.batchName}, Class: ${s.class}, Section: ${s.section}, Department: ${s.department}, StaffBatches: ${JSON.stringify(s.staffBatches)}, SubjectAssignments: ${JSON.stringify(s.subjectAssignments)}`);
  });

  console.log('\n--- ALL TEACHER USERS RECORDS ---');
  users.filter((u: any) => (u.role || '').includes('teacher') || u.role === 'staff').forEach((u: any) => {
    console.log(`User ID: ${u.id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, ClassId: ${u.classId}, ClassName: ${u.className}, BatchId: ${u.batchId}, BatchName: ${u.batchName}, Class: ${u.class}, Section: ${u.section}`);
  });

  console.log('\n--- CLASSES ---');
  classes.forEach((c: any) => console.log(`Class ID: ${c.id}, Name: ${c.name}`));

  console.log('\n--- BATCHES ---');
  batches.forEach((b: any) => console.log(`Batch ID: ${b.id}, Name: ${b.name}, ClassId: ${b.classId}`));

  process.exit(0);
}

checkTeachers().catch(console.error);

import { dbService } from '../src/services/dbService';

async function listAllStaffAndUsers() {
  const staff = await dbService.list('staff') || [];
  console.log(`\n================ ALL STAFF (${staff.length}) ================`);
  for (const s of staff) {
    console.log(`STAFF_DOC: ID="${s.id}" | Name="${s.name}" | First="${s.firstName}" | Last="${s.lastName}" | Email="${s.email}" | Phone="${s.phone || s.whatsappNumber}" | Role="${s.role}" | Desig="${s.designation}" | Dept="${s.department}" | Status="${s.status}" | Deleted=${s.isDeleted} | DemoRemoved=${s.hasDemoNameRemoved}`);
  }

  const users = await dbService.list('users') || [];
  console.log(`\n================ ALL USERS (${users.length}) ================`);
  const nonStudentUsers = users.filter((u: any) => u.role !== 'student');
  for (const u of nonStudentUsers) {
    console.log(`USER_DOC: ID="${u.id}" | Name="${u.name}" | Email="${u.email}" | Phone="${u.phone || u.whatsappNumber}" | Role="${u.role}" | Status="${u.status}" | Deleted=${u.isDeleted}`);
  }

  process.exit(0);
}

listAllStaffAndUsers().catch(console.error);

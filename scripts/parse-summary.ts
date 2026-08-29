import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./detailed_staff_summary.json', 'utf8'));

console.log('=== STAFF COUNT:', data.staff.length, '===');

const keywords = ['anil', 'bala', 'nages', 'babu', 'reddy', 'gurav'];

console.log('\n--- ALL STAFF MATCHING ANY PART OF ANIL, BALA, NAGES, BABU, REDDY, GURAV ---');
data.staff.forEach((s: any) => {
  const str = JSON.stringify(s).toLowerCase();
  if (keywords.some(k => str.includes(k))) {
    console.log(`STAFF: ID="${s.id}" | Name="${s.name}" | First="${s.firstName}" | Last="${s.lastName}" | Email="${s.email}" | Phone="${s.phone || s.whatsappNumber}" | Role="${s.role}" | Desig="${s.designation}" | Status="${s.status}" | Deleted=${s.isDeleted} | DemoRemoved=${s.hasDemoNameRemoved}`);
  }
});

console.log('\n--- ALL BATCHES ---');
data.batches.forEach((b: any) => {
  console.log(`BATCH: ID="${b.id}" | Class="${b.className}" | Name="${b.name}" | Teacher="${b.classTeacher}" | TeacherId="${b.classTeacherId}" | Email="${b.classTeacherEmail}"`);
});

console.log('\n--- ALL LEAVES ---');
data.leaves.forEach((l: any) => {
  console.log(`LEAVE: ID="${l.id}" | Applicant="${l.applicantName}" | AppId="${l.applicantId}" | Phone="${l.phone || l.whatsappNumber}" | Batch="${l.batchId}" | Status="${l.status}"`);
});

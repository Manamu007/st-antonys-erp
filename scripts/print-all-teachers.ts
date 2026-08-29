import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./detailed_staff_summary.json', 'utf8'));

console.log('=== ALL TEACHING STAFF IN DATABASE ===');
const teachingStaff = data.staff.filter((s: any) => 
  s.role?.includes('teacher') || 
  s.staffType === 'teaching' || 
  s.email?.includes('stantonys')
);

console.log(`Total teaching staff: ${teachingStaff.length}`);
teachingStaff.forEach((t: any, idx: number) => {
  console.log(`[${idx+1}] ID: ${t.id}`);
  console.log(`     Name: "${t.name}" | First: "${t.firstName}" | Last: "${t.lastName}"`);
  console.log(`     Email: "${t.email}" | Phone: "${t.phone || t.whatsappNumber}"`);
  console.log(`     Role: "${t.role}" | Desig: "${t.designation}" | BatchId: "${t.classTeacherBatchId || t.batchId || ''}"`);
  console.log(`     HasDemoNameRemoved: ${t.hasDemoNameRemoved} | Status: "${t.status}"`);
});

console.log('\n=== ALL BATCHES AND THEIR CLASS TEACHERS ===');
data.batches.forEach((b: any) => {
  console.log(`BATCH [${b.id}]: Class="${b.className}" | Name="${b.name}" | Teacher="${b.classTeacher}" | TeacherId="${b.classTeacherId}" | Email="${b.classTeacherEmail}"`);
});

import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_students_dump.json', 'utf8'));

console.log("=== 1 Class_IPL Students ===");
const ipl = list.filter(s => s.batchId === '1 Class_IPL');
console.log(`Total in 1 Class_IPL: ${ipl.length}`);

// Group by roll
const iplRolls: Record<string, any[]> = {};
ipl.forEach(s => {
  iplRolls[s.roll] = iplRolls[s.roll] || [];
  iplRolls[s.roll].push(s);
});

Object.entries(iplRolls).forEach(([roll, students]) => {
  console.log(`\nRoll #${roll} (${students.length} student(s)):`);
  students.forEach(s => {
    console.log(`  - [Status: ${s.status}] ID: ${s.id}, Name: ${s.name}, className: "${s.className}", batchName: "${s.batchName}", father: "${s.father}", phone: "${s.phone}", year: "${s.academicYear}"`);
  });
});

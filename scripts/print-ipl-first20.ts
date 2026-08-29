import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_students_dump.json', 'utf8'));
const ipl = list.filter(s => s.batchId === '1 Class_IPL');

console.log("=== First 20 students in 1 Class_IPL ===");
ipl.slice(0, 20).forEach((s, idx) => {
  console.log(`[IPL #${idx+1}] Roll: ${String(s.roll).padStart(2, ' ')} | Status: ${s.status.padEnd(10, ' ')} | Name: ${s.name.padEnd(32, ' ')} | ClassField: "${s.className.padEnd(10, ' ')}" | BatchField: "${s.batchName.padEnd(12, ' ')}" | Father: ${s.father.padEnd(25, ' ')} | ID: ${s.id}`);
});

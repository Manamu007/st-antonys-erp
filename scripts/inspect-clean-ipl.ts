import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_deep_inspection.json', 'utf8'));

// Filter out UKG, 2 Class, Demo, S-Batch, M-Batch
const iplStudents = list.filter(s => {
  const c = String(s.class || s.className || '').trim();
  const b = String(s.batch || s.batchName || '').trim();
  const name = String(s.name || s.firstName || '').trim();
  if (name.toLowerCase().includes('demo student') || s.id.startsWith('student_1786081827075')) return false;
  if (c === 'UKG' || c === '2 Class') return false;
  if (b === 'S-Batch' || s.batchId === '1 Class_S-Batch') return false;
  if (b === 'M-Batch' && s.batchId === '1 Class_M-Batch') return false;
  // What about students in 1 Class_IPL?
  return s.batchId === '1 Class_IPL' || (c === '1 Class' && b === 'IPL');
});

console.log(`=== 1 CLASS IPL STUDENTS (${iplStudents.length}) ===`);
iplStudents.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
iplStudents.forEach(s => {
  console.log(`Roll ${String(s.rollNumber).padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] Name: ${s.name.padEnd(30, ' ')} | Batch: "${s.batch}" | Father: ${s.fatherName} | ID: ${s.id}`);
});

import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_students_dump.json', 'utf8'));

// Filter out UKG, 2 Class, and Demo
const ukgIds = new Set([
  'lavanya_j_91789411',
  'riswitha_k_916311',
  'venkata_mokshith_y_91939811',
  'vijaya_k_91939911',
  'yashwitha_k_91966411',
  'pranay_p_91630511',
  'pravikanshith_k_91964211',
  'venkata_thanush_k_91630511'
]);
const c2Ids = new Set([
  'arjun_tej_kumar_m_91964311',
  'jahnavi_s_91944111'
]);
const demoIds = new Set([
  'student_1786081827075'
]);

const cleaned = list.filter(s => !ukgIds.has(s.id) && !c2Ids.has(s.id) && !demoIds.has(s.id));

console.log("=== REMAINING IN 1 CLASS IPL ===");
const ipl = cleaned.filter(s => s.batchId === '1 Class_IPL');
const iplRolls: Record<string, any[]> = {};
ipl.forEach(s => {
  iplRolls[s.roll] = iplRolls[s.roll] || [];
  iplRolls[s.roll].push(s);
});

Object.entries(iplRolls).forEach(([roll, students]) => {
  if (students.length > 1) {
    console.log(`\nDUPLICATE Roll #${roll} (${students.length} students):`);
    students.forEach(s => {
      console.log(`  - [${s.status}] ID: ${s.id}, Name: ${s.name}, batchField: "${s.batchName}", father: "${s.father}", phone: "${s.phone}"`);
    });
  } else {
    const s = students[0];
    console.log(`Roll #${roll.padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(30, ' ')} | batch: "${s.batchName.padEnd(8, ' ')}" | father: ${s.father}`);
  }
});

console.log("\n=== REMAINING IN 1 CLASS M-BATCH ===");
const mBatch = cleaned.filter(s => s.batchId === '1 Class_M-Batch');
const mRolls: Record<string, any[]> = {};
mBatch.forEach(s => {
  mRolls[s.roll] = mRolls[s.roll] || [];
  mRolls[s.roll].push(s);
});

Object.entries(mRolls).forEach(([roll, students]) => {
  if (students.length > 1) {
    console.log(`\nDUPLICATE Roll #${roll} (${students.length} students):`);
    students.forEach(s => {
      console.log(`  - [${s.status}] ID: ${s.id}, Name: ${s.name}, batchField: "${s.batchName}", father: "${s.father}", phone: "${s.phone}"`);
    });
  } else {
    const s = students[0];
    console.log(`Roll #${roll.padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(30, ' ')} | batch: "${s.batchName.padEnd(8, ' ')}" | father: ${s.father}`);
  }
});

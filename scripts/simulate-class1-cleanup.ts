import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_deep_inspection.json', 'utf8'));

console.log(`Total inspect records: ${list.length}`);

// Let's categorize every student
const ukgList: any[] = [];
const c2List: any[] = [];
const demoList: any[] = [];
const iplList: any[] = [];
const mBatchList: any[] = [];
const sBatchList: any[] = [];
const otherList: any[] = [];

list.forEach(s => {
  const c = String(s.class || s.className || '').trim();
  const b = String(s.batch || s.batchName || '').trim();
  const name = String(s.name || s.firstName || '').trim();

  if (name.toLowerCase().includes('demo student') || s.id.startsWith('student_1786081827075')) {
    demoList.push(s);
  } else if (c === 'UKG') {
    ukgList.push(s);
  } else if (c === '2 Class') {
    c2List.push(s);
  } else if (b === 'S-Batch' || s.batchId === '1 Class_S-Batch') {
    sBatchList.push(s);
  } else if (b === 'IPL' || (!b && s.batchId === '1 Class_IPL')) {
    iplList.push(s);
  } else if (b === 'M-Batch' || (!b && s.batchId === '1 Class_M-Batch')) {
    mBatchList.push(s);
  } else {
    otherList.push(s);
  }
});

console.log(`\nBreakdown:`);
console.log(`- Demo: ${demoList.length}`);
console.log(`- UKG (in 1 Class): ${ukgList.length}`);
console.log(`- 2 Class (in 1 Class): ${c2List.length}`);
console.log(`- 1 Class IPL: ${iplList.length}`);
console.log(`- 1 Class M-Batch: ${mBatchList.length}`);
console.log(`- 1 Class S-Batch: ${sBatchList.length}`);
console.log(`- Other: ${otherList.length}`);

console.log("\n================ 1 CLASS IPL ================");
iplList.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
iplList.forEach(s => {
  console.log(`Roll ${String(s.rollNumber).padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(32, ' ')} | Father: ${s.fatherName} | ID: ${s.id}`);
});

console.log("\n================ 1 CLASS M-BATCH ================");
mBatchList.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
mBatchList.forEach(s => {
  console.log(`Roll ${String(s.rollNumber).padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(32, ' ')} | Father: ${s.fatherName} | ID: ${s.id}`);
});

console.log("\n================ 1 CLASS S-BATCH ================");
sBatchList.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
sBatchList.forEach(s => {
  console.log(`Roll ${String(s.rollNumber).padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(32, ' ')} | Father: ${s.fatherName} | ID: ${s.id}`);
});

console.log("\n================ UKG STUDENTS TO MOVE ================");
ukgList.forEach(s => {
  console.log(`Roll ${String(s.rollNumber).padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(32, ' ')} | class: ${s.class}, batch: ${s.batch} | ID: ${s.id}`);
});

console.log("\n================ 2 CLASS STUDENTS TO MOVE ================");
c2List.forEach(s => {
  console.log(`Roll ${String(s.rollNumber).padStart(2, ' ')}: [${s.status.padEnd(8, ' ')}] ${s.name.padEnd(32, ' ')} | class: ${s.class}, batch: ${s.batch} | ID: ${s.id}`);
});

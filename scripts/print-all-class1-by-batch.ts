import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_students_dump.json', 'utf8'));

console.log("==================== 1 CLASS IPL ====================");
const ipl = list.filter(s => s.batchId === '1 Class_IPL');
ipl.forEach((s, idx) => {
  console.log(`[IPL #${idx+1}] Roll: ${s.roll.padStart(2, ' ')} | Status: ${s.status.padEnd(10, ' ')} | Name: ${s.name.padEnd(30, ' ')} | ClassField: "${s.className}" | BatchField: "${s.batchName}" | Father: ${s.father} | ID: ${s.id}`);
});

console.log("\n==================== 1 CLASS M-BATCH ====================");
const mBatch = list.filter(s => s.batchId === '1 Class_M-Batch');
mBatch.forEach((s, idx) => {
  console.log(`[M-Batch #${idx+1}] Roll: ${s.roll.padStart(2, ' ')} | Status: ${s.status.padEnd(10, ' ')} | Name: ${s.name.padEnd(30, ' ')} | ClassField: "${s.className}" | BatchField: "${s.batchName}" | Father: ${s.father} | ID: ${s.id}`);
});

console.log("\n==================== 1 CLASS S-BATCH ====================");
const sBatch = list.filter(s => s.batchId === '1 Class_S-Batch');
sBatch.forEach((s, idx) => {
  console.log(`[S-Batch #${idx+1}] Roll: ${s.roll.padStart(2, ' ')} | Status: ${s.status.padEnd(10, ' ')} | Name: ${s.name.padEnd(30, ' ')} | ClassField: "${s.className}" | BatchField: "${s.batchName}" | Father: ${s.father} | ID: ${s.id}`);
});

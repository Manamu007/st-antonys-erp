import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_deep_inspection.json', 'utf8'));

// Apply the classification
const ipl: any[] = [];
const mBatch: any[] = [];
const sBatch: any[] = [];
const ukg: any[] = [];
const c2: any[] = [];
const demo: any[] = [];

list.forEach(s => {
  const c = String(s.class || s.className || '').trim();
  const b = String(s.batch || s.batchName || '').trim();
  const bId = String(s.batchId || '').trim();
  const name = String(s.name || s.firstName || '').trim();

  if (name.toLowerCase().includes('demo student') || s.id.startsWith('student_1786081827075')) {
    demo.push(s);
    return;
  }
  if (c === 'UKG') {
    ukg.push(s);
    return;
  }
  if (c === '2 Class') {
    c2.push(s);
    return;
  }

  // S-Batch
  if (b === 'S-Batch' || bId === '1 Class_S-Batch') {
    sBatch.push(s);
    return;
  }

  // M-Batch
  if (b === 'M-Batch' || bId === '1 Class_M-Batch' || s.id === 'aman_sk_91964111' || s.id === 'venkata_rithvik_m_91939911') {
    mBatch.push(s);
    return;
  }

  // IPL
  ipl.push(s);
});

console.log("==================== 1 CLASS IPL ====================");
console.log(`Total students: ${ipl.length}`);
const iplActive = ipl.filter(s => s.status === 'active' || !s.status);
const iplInactive = ipl.filter(s => s.status !== 'active' && s.status);
console.log(`Active: ${iplActive.length}, Inactive: ${iplInactive.length}`);

iplActive.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
const iplRollMap: Record<string, any[]> = {};
iplActive.forEach(s => {
  const r = String(s.rollNumber);
  iplRollMap[r] = iplRollMap[r] || [];
  iplRollMap[r].push(s);
});

Object.entries(iplRollMap).forEach(([r, sts]) => {
  if (sts.length > 1) {
    console.log(`[!] DUPLICATE Roll #${r}:`);
    sts.forEach(s => console.log(`    - ID: ${s.id} | Name: ${s.name} | Father: ${s.fatherName}`));
  } else {
    console.log(`    Roll #${r.padStart(2, ' ')}: ${sts[0].name.padEnd(32, ' ')} | Father: ${sts[0].fatherName}`);
  }
});

console.log("\n==================== 1 CLASS M-BATCH ====================");
console.log(`Total students: ${mBatch.length}`);
const mActive = mBatch.filter(s => s.status === 'active' || !s.status);
const mInactive = mBatch.filter(s => s.status !== 'active' && s.status);
console.log(`Active: ${mActive.length}, Inactive: ${mInactive.length}`);

mActive.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
const mRollMap: Record<string, any[]> = {};
mActive.forEach(s => {
  const r = String(s.rollNumber);
  mRollMap[r] = mRollMap[r] || [];
  mRollMap[r].push(s);
});

Object.entries(mRollMap).forEach(([r, sts]) => {
  if (sts.length > 1) {
    console.log(`[!] DUPLICATE Roll #${r}:`);
    sts.forEach(s => console.log(`    - ID: ${s.id} | Name: ${s.name} | Father: ${s.fatherName}`));
  } else {
    console.log(`    Roll #${r.padStart(2, ' ')}: ${sts[0].name.padEnd(32, ' ')} | Father: ${sts[0].fatherName}`);
  }
});

console.log("\n==================== 1 CLASS S-BATCH ====================");
console.log(`Total students: ${sBatch.length}`);
const sActive = sBatch.filter(s => s.status === 'active' || !s.status);
const sInactive = sBatch.filter(s => s.status !== 'active' && s.status);
console.log(`Active: ${sActive.length}, Inactive: ${sInactive.length}`);

sActive.sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
const sRollMap: Record<string, any[]> = {};
sActive.forEach(s => {
  const r = String(s.rollNumber);
  sRollMap[r] = sRollMap[r] || [];
  sRollMap[r].push(s);
});

Object.entries(sRollMap).forEach(([r, sts]) => {
  if (sts.length > 1) {
    console.log(`[!] DUPLICATE Roll #${r}:`);
    sts.forEach(s => console.log(`    - ID: ${s.id} | Name: ${s.name} | Father: ${s.fatherName}`));
  } else {
    console.log(`    Roll #${r.padStart(2, ' ')}: ${sts[0].name.padEnd(32, ' ')} | Father: ${sts[0].fatherName}`);
  }
});

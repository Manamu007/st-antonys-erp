import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_deep_inspection.json', 'utf8'));

// Categorize
const ipl: any[] = [];
const mBatch: any[] = [];
const sBatch: any[] = [];

list.forEach(s => {
  const c = String(s.class || s.className || '').trim();
  const b = String(s.batch || s.batchName || '').trim();
  const name = String(s.name || s.firstName || '').trim();
  if (name.toLowerCase().includes('demo student') || s.id.startsWith('student_1786081827075')) return;
  if (c === 'UKG' || c === '2 Class') return;

  if (b === 'S-Batch' || s.batchId === '1 Class_S-Batch') {
    sBatch.push(s);
  } else if (b === 'M-Batch' || s.id === 'aman_sk_91964111' || s.id === 'venkata_rithvik_m_91939911') {
    mBatch.push(s);
  } else {
    ipl.push(s);
  }
});

function analyzeBatch(name: string, arr: any[]) {
  console.log(`\n=================== ${name} (${arr.length} students) ===================`);
  // Group by active vs inactive
  const active = arr.filter(s => s.status === 'active' || !s.status);
  const inactive = arr.filter(s => s.status === 'inactive' || s.status === 'non_attending');
  console.log(`Active: ${active.length}, Inactive: ${inactive.length}`);

  const activeRolls: Record<string, any[]> = {};
  active.forEach(s => {
    const r = String(s.rollNumber || s.roll || 'NO_ROLL');
    activeRolls[r] = activeRolls[r] || [];
    activeRolls[r].push(s);
  });

  console.log('\n--- ACTIVE ROLL CHECKS ---');
  let duplicateActive = 0;
  Object.keys(activeRolls).sort((a, b) => Number(a) - Number(b)).forEach(r => {
    const sts = activeRolls[r];
    if (sts.length > 1) {
      duplicateActive++;
      console.log(`[!] DUPLICATE ACTIVE Roll #${r} (${sts.length} students):`);
      sts.forEach(s => console.log(`    - ID: ${s.id} | Name: ${s.name} | Father: ${s.fatherName} | Mobile: ${s.phone || s.mobileNumber}`));
    } else {
      console.log(`    Roll #${r.padStart(2, ' ')}: ${sts[0].name.padEnd(32, ' ')} | Father: ${sts[0].fatherName}`);
    }
  });

  console.log(`Total duplicate active roll numbers in ${name}: ${duplicateActive}`);
}

analyzeBatch('1 CLASS IPL', ipl);
analyzeBatch('1 CLASS M-BATCH', mBatch);
analyzeBatch('1 CLASS S-BATCH', sBatch);

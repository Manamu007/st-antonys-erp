import * as fs from 'fs';

function printMismatches() {
  if (!fs.existsSync('./all_mismatches.json')) {
    console.log('File not ready');
    return;
  }
  const mismatches: any[] = JSON.parse(fs.readFileSync('./all_mismatches.json', 'utf8'));
  console.log(`Total mismatches: ${mismatches.length}`);

  // Let's filter by those currently in 1 Class
  const inClass1 = mismatches.filter(m => m.classId === '1_Class_Class' || m.batchId.startsWith('1 Class_'));
  console.log(`\n=== Mismatches in 1 Class (${inClass1.length}) ===`);
  inClass1.forEach(m => {
    console.log(`- [${m.status}] Roll: ${m.roll} | Name: ${m.name} | class: "${m.class}" (classId: ${m.classId}) | batch: "${m.batch}" (batchId: ${m.batchId}) | Father: ${m.father} | Reason: ${m.reason} | ID: ${m.id}`);
  });
}

printMismatches();

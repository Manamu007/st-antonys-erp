import * as fs from 'fs';

function analyze() {
  if (!fs.existsSync('./class1_students_dump.json')) {
    console.log('File not ready yet');
    return;
  }
  const list: any[] = JSON.parse(fs.readFileSync('./class1_students_dump.json', 'utf8'));
  console.log(`Analyzing ${list.length} records...`);

  // Group by batchId
  const byBatch: Record<string, any[]> = {};
  list.forEach(s => {
    byBatch[s.batchId] = byBatch[s.batchId] || [];
    byBatch[s.batchId].push(s);
  });

  Object.entries(byBatch).forEach(([batchId, students]) => {
    console.log(`\n================== BATCH: ${batchId} (Total: ${students.length}) ==================`);
    // Find duplicate roll numbers
    const rollMap: Record<string, any[]> = {};
    students.forEach(s => {
      rollMap[s.roll] = rollMap[s.roll] || [];
      rollMap[s.roll].push(s);
    });

    console.log('--- Duplicate Roll Numbers ---');
    Object.entries(rollMap).forEach(([roll, group]) => {
      if (group.length > 1) {
        console.log(`\nRoll #${roll} has ${group.length} students:`);
        group.forEach(s => {
          console.log(`  - [${s.status}] ID: ${s.id}, Name: ${s.name}, className: "${s.className}", batchName: "${s.batchName}", father: ${s.father}, year: ${s.academicYear}`);
        });
      }
    });

    console.log('\n--- Students with className != "1 Class" or batchName != expected ---');
    students.forEach(s => {
      if (s.className !== '1 Class' || !s.batchName.includes(batchId.replace('1 Class_', ''))) {
        console.log(`  * Mismatch: ID: ${s.id}, Name: ${s.name}, roll: ${s.roll}, class: "${s.className}", classId: "${s.classId}", batch: "${s.batchName}", batchId: "${s.batchId}", status: ${s.status}`);
      }
    });
  });
}

analyze();

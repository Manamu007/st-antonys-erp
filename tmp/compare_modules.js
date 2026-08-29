const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function compareModules() {
  const classesSnap = await getDocs(collection(db, 'classes'));
  const batchesSnap = await getDocs(collection(db, 'batches'));
  const studentsSnap = await getDocs(collection(db, 'students'));

  const classes = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const batches = batchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const rawStudents = studentsSnap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }));

  const normalizeStudentStatus = (status) => {
    const s = String(status || '').toLowerCase().trim().replace(/[- ]/g, '_');
    if (s === 'non_attending' || s === 'nonattending') return 'non_attending';
    if (s === 'inactive' || s === 'dropped' || s === 'tc_issued' || s === 'withdrawn' || s === 'left' || s === 'archived' || s === 'deleted') return 'inactive';
    return 'active';
  };

  function countStudentsModule(cId, bId) {
    const selectedClass = classes.find(c => c.id === cId);
    const targetClassName = (selectedClass?.name || '').trim().toLowerCase();
    const selectedBatch = batches.find(b => b.id === bId);
    const targetBatchName = (selectedBatch?.name || '').trim().toLowerCase();

    return rawStudents.filter(s => {
      if (normalizeStudentStatus(s.status) !== 'active') return false;
      if (cId) {
        const sClassId = String(s.classId || '').trim();
        const sClassName = String(s.className || s.class || '').trim().toLowerCase();
        const classMatches = sClassId === cId || (targetClassName && (sClassName === targetClassName || sClassName.includes(targetClassName)));
        if (!classMatches) return false;
      }
      if (bId) {
        const sBatchId = String(s.batchId || '').trim();
        const sBatch = String(s.batch || s.batchName || '').trim().toLowerCase();
        const batchMatches = sBatchId === bId || sBatchId === selectedBatch?.name || (targetBatchName && (sBatch === targetBatchName || sBatch.includes(targetBatchName)));
        if (!batchMatches) return false;
      }
      return true;
    }).length;
  }

  function countAttendanceModule(cId, bId) {
    const selectedClassObj = classes.find(c => c.id === cId);
    const selectedClassName = selectedClassObj?.name?.toLowerCase().trim();
    const selectedBatchObj = batches.find(b => b.id === bId);
    const selectedBatchName = selectedBatchObj?.name?.toLowerCase().trim();

    return rawStudents.filter(p => {
      const pStatusClean = String(p.status || '').toLowerCase().trim().replace(/[- ]/g, '_');
      const isNonAttending = pStatusClean === 'non_attending' || pStatusClean === 'nonattending';
      const isInactive = pStatusClean === 'inactive' || pStatusClean === 'dropped' || pStatusClean === 'tc_issued' || pStatusClean === 'withdrawn' || pStatusClean === 'left' || pStatusClean === 'archived' || pStatusClean === 'deleted';
      if (isNonAttending || isInactive) return false;

      const matchesClass = !cId || cId === 'all' || 
        p.classId === cId ||
        p.class === cId ||
        p.className === cId ||
        (selectedClassName && (
          (p.class && p.class.toLowerCase().trim() === selectedClassName) ||
          (p.className && p.className.toLowerCase().trim() === selectedClassName) ||
          (p.classId && p.classId.toLowerCase().trim() === selectedClassName) ||
          (p.classId && p.classId.replace(/_/g, ' ').toLowerCase().trim().includes(selectedClassName))
        ));

      const matchesBatch = !bId || bId === 'all' || 
        p.batchId === bId ||
        p.batch === bId ||
        p.batchName === bId ||
        (selectedBatchName && (
          (p.batch && p.batch.toLowerCase().trim() === selectedBatchName) ||
          (p.batchName && p.batchName.toLowerCase().trim() === selectedBatchName) ||
          (p.batchId && p.batchId.toLowerCase().trim() === selectedBatchName) ||
          (p.batchId && p.batchId.toLowerCase().endsWith('_' + selectedBatchName)) ||
          (p.batchId && p.batchId.toLowerCase().includes(selectedBatchName))
        ));

      return matchesClass && matchesBatch;
    }).length;
  }

  console.log('=== COMPARISON OF EVERY CLASS & BATCH ===');
  classes.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => {
    const classBatches = batches.filter(b => b.classId === c.id);
    const studCount = countStudentsModule(c.id, null);
    const attCount = countAttendanceModule(c.id, 'all');
    console.log('Class: ' + c.name + ' (' + c.id + ') -> Students Module: ' + studCount + ' | Attendance Module: ' + attCount);
    classBatches.forEach(b => {
      const bStud = countStudentsModule(c.id, b.id);
      const bAtt = countAttendanceModule(c.id, b.id);
      console.log('   Batch: ' + b.name + ' (' + b.id + ') -> Students: ' + bStud + ' | Attendance: ' + bAtt + (bStud !== bAtt ? ' *** MISMATCH ***' : ''));
    });
  });

  process.exit(0);
}
compareModules();

import { Router } from 'express';
import { getMongoDb } from './mongoSession.js';
import { listDocuments, countDocuments, setBatchDocuments } from './mongoDocService.js';
import { resolveStudentClassAndBatch, sortStudentsBySectionRules, normalizeStudentGender } from '../lib/utils.js';

const router = Router();

/**
 * GET /api/students
 * Return students matching optional query filters
 */
router.get('/', async (req, res) => {
  try {
    const { status, classId, batchId, search, limit = '10000' } = req.query;
    const limitNum = Math.min(50000, parseInt(limit as string, 10) || 10000);

    const mongo = await getMongoDb().catch(() => null);
    if (mongo) {
      const query: any = {};
      if (status) query.status = status;
      else query.status = { $ne: 'deleted' };
      if (classId) {
        query.$or = [{ classId: classId }, { class: classId }, { className: classId }];
      }
      if (batchId) {
        const batchConditions = [{ batchId: batchId }, { batch: batchId }, { batchName: batchId }];
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: batchConditions }];
          delete query.$or;
        } else {
          query.$or = batchConditions;
        }
      }
      if (search) {
        query.$or = [
          { studentName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { admissionNumber: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      const students = await mongo.collection('students')
        .find(query)
        .limit(limitNum)
        .toArray()
        .catch(() => []);

      if (students.length > 0) {
        const formatted = students.map((s: any) => ({
          id: s._id?.toString() || s.id,
          uid: s._id?.toString() || s.id,
          ...s
        }));
        return res.json(formatted);
      }
    }

    // Retrieve students from Cloud Firestore (primary fallback)
    const constraints: any[] = [];
    if (status) {
      constraints.push({ type: 'where', field: 'status', op: '==', value: status });
    }
    if (classId) {
      constraints.push({ type: 'where', field: 'classId', op: '==', value: classId });
    }
    if (batchId) {
      constraints.push({ type: 'where', field: 'batchId', op: '==', value: batchId });
    }
    constraints.push({ type: 'limit', value: limitNum });

    let students = await listDocuments('students', constraints);

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      students = students.filter((s: any) => {
        const name = (s.name || s.studentName || '').toLowerCase();
        const adm = (s.admissionNumber || s.roll || '').toLowerCase();
        const ph = (s.phone || s.fatherPhone || '').toLowerCase();
        return name.includes(q) || adm.includes(q) || ph.includes(q);
      });
    }

    if (Array.isArray(students) && students.length > 0) {
      return res.json(students);
    }

    // In preview mode or when local database is empty, route directly to https://antonyschool.in/api/students
    try {
      const url = new URL('https://antonyschool.in/api/students');
      if (req.query) {
        Object.entries(req.query).forEach(([k, v]) => {
          if (v) url.searchParams.append(k, String(v));
        });
      }
      const vpsRes = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (vpsRes.ok) {
        const liveStudents = await vpsRes.json();
        if (Array.isArray(liveStudents) && liveStudents.length > 0) {
          return res.json(liveStudents);
        }
      }
    } catch (vpsErr: any) {
      console.warn('[StudentRoutes] Live antonyschool.in student fetch notice:', vpsErr?.message || vpsErr);
    }

    return res.json([]);
  } catch (err: any) {
    console.error('[StudentRoutes API Error]', err);
    res.json([]);
  }
});

/**
 * GET /api/students/count
 */
router.get('/count', async (req, res) => {
  try {
    const mongo = await getMongoDb().catch(() => null);
    if (mongo) {
      const count = await mongo.collection('students').countDocuments({ status: { $ne: 'deleted' } }).catch(() => 0);
      if (count > 0) {
        return res.json({ success: true, count });
      }
    }

    const { status, classId, batchId } = req.query;
    const constraints: any[] = [];
    if (status) {
      constraints.push({ type: 'where', field: 'status', op: '==', value: status });
    }
    if (classId) {
      constraints.push({ type: 'where', field: 'classId', op: '==', value: classId });
    }
    if (batchId) {
      constraints.push({ type: 'where', field: 'batchId', op: '==', value: batchId });
    }

    const count = await countDocuments('students', constraints);
    if (typeof count === 'number' && count > 0) {
      return res.json({ success: true, count });
    }

    // Live antonyschool.in student count
    try {
      const url = new URL('https://antonyschool.in/api/students/count');
      if (req.query) {
        Object.entries(req.query).forEach(([k, v]) => {
          if (v) url.searchParams.append(k, String(v));
        });
      }
      const vpsRes = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (vpsRes.ok) {
        const countData = await vpsRes.json();
        return res.json(countData);
      }
    } catch (_) {}

    return res.json({ success: true, count: 0 });
  } catch {
    res.json({ success: true, count: 0 });
  }
});

/**
 * POST /api/students/auto-assign-roll-numbers
 * Automatically assigns roll numbers according to school rule:
 * In each section, male students appear first in ascending alphabetical order of name (1..M),
 * and female students appear second in ascending alphabetical order of name (M+1..N).
 */
router.post('/auto-assign-roll-numbers', async (req, res) => {
  try {
    const { classId, batchId } = req.body || {};

    const mongo = await getMongoDb().catch(() => null);

    // 1. Fetch classes & batches
    let classes: any[] = [];
    let batches: any[] = [];
    if (mongo) {
      classes = await mongo.collection('classes').find({}).toArray().catch(() => []);
      batches = await mongo.collection('batches').find({}).toArray().catch(() => []);
    }
    if (!classes.length || !batches.length) {
      classes = await listDocuments('classes', []);
      batches = await listDocuments('batches', []);
    }

    // 2. Fetch students
    let allStudents: any[] = [];
    if (mongo) {
      allStudents = await mongo.collection('students')
        .find({ status: { $ne: 'deleted' } })
        .toArray()
        .catch(() => []);
    }
    if (!allStudents.length) {
      allStudents = await listDocuments('students', []);
    }
    if (!allStudents.length) {
      try {
        const vpsRes = await fetch('https://antonyschool.in/api/students', {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        });
        if (vpsRes.ok) {
          allStudents = await vpsRes.json();
        }
      } catch (_) {}
    }

    if (!Array.isArray(allStudents) || allStudents.length === 0) {
      return res.json({ success: false, message: 'No students found to assign roll numbers' });
    }

    // Filter to target students if specific class/batch requested
    const targetStudents = allStudents.filter(s => {
      if (!s || s.status === 'deleted') return false;
      const res = resolveStudentClassAndBatch(s, classes, batches);
      if (classId) {
        const cMatch = res.classId === classId || s.classId === classId || s.class === classId || (s.className && s.className === classId);
        if (!cMatch) return false;
      }
      if (batchId) {
        const bMatch = res.batchId === batchId || s.batchId === batchId || s.batch === batchId || (s.batchName && s.batchName === batchId);
        if (!bMatch) return false;
      }
      return true;
    });

    // Group students by section (class & batch) using robust resolution
    const sectionMap = new Map<string, any[]>();
    for (const s of targetStudents) {
      const res = resolveStudentClassAndBatch(s, classes, batches);
      const effectiveClassId = res.classId || s.classId || s.class || 'UnknownClass';
      const effectiveBatchId = res.batchId || s.batchId || s.batch || 'UnknownBatch';
      const secKey = `${effectiveClassId}:::${effectiveBatchId}`;
      if (!sectionMap.has(secKey)) sectionMap.set(secKey, []);
      sectionMap.get(secKey)!.push(s);
    }

    const itemsToUpdate: Array<{ id: string; data: any }> = [];
    const updatedStudentSummaries: Array<{ id: string; name: string; rollNumber: string; gender: string; section: string }> = [];

    for (const [secKey, list] of sectionMap.entries()) {
      // In each section: male students appear first in ascending alphabetical order,
      // and female students appear second in ascending alphabetical order
      const ordered = sortStudentsBySectionRules(list);
      const [effClassId, effBatchId] = secKey.split(':::');
      const targetClassObj = classes.find(c => c.id === effClassId);
      const targetBatchObj = batches.find(b => b.id === effBatchId);
      const effClassName = targetClassObj?.name || effClassId;
      const effBatchName = targetBatchObj?.name || targetBatchObj?.section || effBatchId;

      ordered.forEach((s, idx) => {
        const expectedRollNo = String(idx + 1);
        const sId = s.id || s.uid || (s._id ? s._id.toString() : '');
        if (!sId) return;

        const currentRoll = String(s.rollNumber || s.rollNo || '').trim();
        const needsClassSync = effClassId && effClassId !== 'UnknownClass' && (s.classId !== effClassId || s.className !== effClassName);
        const needsBatchSync = effBatchId && effBatchId !== 'UnknownBatch' && (s.batchId !== effBatchId || (s.batch && s.batch !== effBatchName && s.batch !== targetBatchObj?.section));

        if (currentRoll !== expectedRollNo || needsClassSync || needsBatchSync) {
          const updateData: any = {
            rollNumber: expectedRollNo,
            rollNo: expectedRollNo,
            updatedAt: new Date().toISOString()
          };
          if (needsClassSync) {
            updateData.classId = effClassId;
            updateData.className = effClassName;
            updateData.class = effClassName;
          }
          if (needsBatchSync) {
            updateData.batchId = effBatchId;
            updateData.batchName = effBatchName;
            updateData.batch = effBatchName;
            if (targetBatchObj?.section) updateData.section = targetBatchObj.section;
          }

          itemsToUpdate.push({
            id: sId,
            data: updateData
          });
        }
        updatedStudentSummaries.push({
          id: sId,
          name: s.name || `${s.firstName || ''} ${s.secondName || ''}`.trim(),
          rollNumber: expectedRollNo,
          gender: s.gender || 'male',
          section: secKey
        });
      });
    }

    // Persist in batches of 100
    if (itemsToUpdate.length > 0) {
      if (mongo) {
        const col = mongo.collection('students');
        const bulkOps = itemsToUpdate.map(item => ({
          updateOne: {
            filter: { $or: [{ id: item.id }, { uid: item.id }] },
            update: { $set: item.data }
          }
        }));
        await col.bulkWrite(bulkOps).catch(err => console.warn('[AutoAssignRoll] Mongo bulkWrite notice:', err?.message || err));
      }

      // Update in doc service and live proxy in chunks
      const CHUNK_SIZE = 100;
      for (let i = 0; i < itemsToUpdate.length; i += CHUNK_SIZE) {
        const chunk = itemsToUpdate.slice(i, i + CHUNK_SIZE);
        await setBatchDocuments('students', chunk).catch(() => {});
      }
    }

    return res.json({
      success: true,
      message: `Successfully assigned roll numbers for ${updatedStudentSummaries.length} students across ${sectionMap.size} sections (Boys first ascending, Girls second ascending).`,
      updatedCount: itemsToUpdate.length,
      totalInSections: updatedStudentSummaries.length,
      sectionsProcessed: sectionMap.size,
      samples: updatedStudentSummaries.slice(0, 20)
    });
  } catch (err: any) {
    console.error('[AutoAssignRollNumbers Error]', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

export default router;

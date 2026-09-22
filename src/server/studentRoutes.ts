import { Router } from 'express';
import { getMongoDb } from './mongoSession.js';
import { listDocuments, countDocuments } from './firestoreService.js';

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
      if (classId) query.classId = classId;
      if (batchId) query.batchId = batchId;
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

export default router;

import { Router } from 'express';
import { getMongoDb } from './mongoSession.js';
import { getDbAdmin } from './db.js';

const router = Router();

/**
 * GET /api/students
 * Return students matching optional query filters
 */
router.get('/', async (req, res) => {
  try {
    const { status, classId, batchId, search, limit = '100' } = req.query;
    const limitNum = Math.min(500, parseInt(limit as string, 10) || 100);

    // 1. In preview mode or when connecting to live school data, route directly to https://antonyschool.in/api/students
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

    // In preview mode or when local MongoDB is not connected, route directly to https://antonyschool.in/api/students
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
        return res.json(liveStudents);
      }
    } catch (vpsErr: any) {
      console.warn('[StudentRoutes] Live antonyschool.in student fetch failed:', vpsErr?.message || vpsErr);
    }

    const dbAdmin = getDbAdmin();
    const snap = await dbAdmin.collection('students').limit(limitNum).get().catch(() => null);
    if (snap && !snap.empty) {
      let students = snap.docs.map((d: any) => ({ id: d.id, uid: d.id, ...d.data() }));
      if (status) students = students.filter((s: any) => s.status === status);
      else students = students.filter((s: any) => s.status !== 'deleted' && s.status !== 'inactive');
      if (classId) students = students.filter((s: any) => s.classId === classId);
      if (batchId) students = students.filter((s: any) => s.batchId === batchId);
      return res.json(students);
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
      return res.json({ success: true, count });
    }

    // Live antonyschool.in count
    try {
      const vpsRes = await fetch('https://antonyschool.in/api/students/count', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (vpsRes.ok) {
        const countData = await vpsRes.json();
        return res.json(countData);
      }
    } catch (_) {}

    const dbAdmin = getDbAdmin();
    const snap = await dbAdmin.collection('students').limit(1000).get().catch(() => null);
    return res.json({ success: true, count: snap ? snap.size : 0 });
  } catch {
    res.json({ success: true, count: 0 });
  }
});

export default router;

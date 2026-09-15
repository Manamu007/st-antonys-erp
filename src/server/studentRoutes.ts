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

      const formatted = students.map((s: any) => ({
        id: s._id?.toString() || s.id,
        uid: s._id?.toString() || s.id,
        ...s
      }));
      return res.json(formatted);
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

    const dbAdmin = getDbAdmin();
    const snap = await dbAdmin.collection('students').limit(1000).get().catch(() => null);
    return res.json({ success: true, count: snap ? snap.size : 0 });
  } catch {
    res.json({ success: true, count: 0 });
  }
});

export default router;

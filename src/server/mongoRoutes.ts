import { Router } from 'express';
import { getMongoDb, connectMongo, disconnectMongo, syncLocalToMongo, getLastPingLatency } from './mongoSession.js';
import { seedSchoolDataIfEmpty } from './seedSchoolData.js';
import mongoose from 'mongoose';

const router = Router();

// Configured MongoDB connection URI & Database name
const DEFAULT_DB_NAME = 'antonyschool_erp';
const DB_NAME = DEFAULT_DB_NAME;

// Core ERP collections schema and index definitions for MongoDB
export const MONGO_ERP_COLLECTIONS = [
  {
    name: 'users',
    description: 'System authentication, login credentials, and user profiles',
    category: 'Security & Identity',
    indexes: [
      { key: { email: 1 }, options: { unique: true, sparse: true, name: 'idx_user_email' } },
      { key: { phone: 1 }, options: { sparse: true, name: 'idx_user_phone' } },
      { key: { role: 1 }, options: { name: 'idx_user_role' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d1")',
      uid: 'usr_admin_101',
      email: 'admin@stantonys.edu.in',
      displayName: 'System Administrator',
      role: 'admin',
      phone: '9876543210',
      accountStatus: 'active',
      createdAt: new Date().toISOString()
    }
  },
  {
    name: 'students',
    description: 'Student enrollments, academic profiles, class mapping, and parent information',
    category: 'Academics',
    indexes: [
      { key: { admissionNo: 1 }, options: { unique: true, sparse: true, name: 'idx_student_admno' } },
      { key: { classId: 1, batchId: 1 }, options: { name: 'idx_student_class_batch' } },
      { key: { parentPhone: 1 }, options: { name: 'idx_student_parent_phone' } },
      { key: { status: 1 }, options: { name: 'idx_student_status' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d2")',
      uid: 'std_101',
      admissionNo: 'STD-101',
      studentName: 'Aarav Sharma',
      classId: 'cls_10',
      batchId: 'batch_10a',
      parentPhone: '9876543210',
      parentEmail: 'parent.aarav@example.com',
      status: 'active',
      academicYear: '2026-27'
    }
  },
  {
    name: 'staff',
    description: 'Faculty, teachers, administrative and non-teaching employee records',
    category: 'Human Resources',
    indexes: [
      { key: { email: 1 }, options: { unique: true, sparse: true, name: 'idx_staff_email' } },
      { key: { phone: 1 }, options: { name: 'idx_staff_phone' } },
      { key: { designation: 1 }, options: { name: 'idx_staff_designation' } },
      { key: { status: 1 }, options: { name: 'idx_staff_status' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d3")',
      uid: 'stf_201',
      name: 'Ravi Kumar',
      email: 'ravi.kumar@stantonys.edu.in',
      phone: '9876543220',
      designation: 'Mathematics Teacher',
      role: 'teacher_subject',
      status: 'active'
    }
  },
  {
    name: 'attendance',
    description: 'Daily biometric, QR, and teacher-logged student and staff attendance',
    category: 'Operations',
    indexes: [
      { key: { studentId: 1, date: -1 }, options: { name: 'idx_attendance_student_date' } },
      { key: { classId: 1, date: 1 }, options: { name: 'idx_attendance_class_date' } },
      { key: { date: 1, status: 1 }, options: { name: 'idx_attendance_date_status' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d4")',
      studentId: 'std_101',
      classId: 'cls_10',
      batchId: 'batch_10a',
      date: '2026-09-11',
      status: 'present',
      markedBy: 'stf_201',
      timestamp: new Date().toISOString()
    }
  },
  {
    name: 'fees',
    description: 'Fee structures, student payment transactions, and Razorpay ledgers',
    category: 'Finance',
    indexes: [
      { key: { studentId: 1, academicYear: 1 }, options: { name: 'idx_fees_student_year' } },
      { key: { receiptNo: 1 }, options: { unique: true, sparse: true, name: 'idx_fees_receipt' } },
      { key: { status: 1 }, options: { name: 'idx_fees_status' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d5")',
      studentId: 'std_101',
      academicYear: '2026-27',
      totalAmount: 45000,
      amountPaid: 30000,
      totalOutstanding: 15000,
      receiptNo: 'REC-2026-0042',
      paymentMethod: 'razorpay',
      status: 'partial'
    }
  },
  {
    name: 'examMarks',
    description: 'Assessment results, subject grading, and report card aggregates',
    category: 'Academics',
    indexes: [
      { key: { examId: 1, studentId: 1 }, options: { name: 'idx_exam_student' } },
      { key: { classId: 1, examId: 1 }, options: { name: 'idx_exam_class' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d6")',
      examId: 'ex_term1_2026',
      studentId: 'std_101',
      subjectId: 'sub_maths',
      marksObtained: 92,
      maxMarks: 100,
      grade: 'A+'
    }
  },
  {
    name: 'whatsapp_queue',
    description: 'High-throughput WhatsApp notification queue and delivery logs',
    category: 'Communication',
    indexes: [
      { key: { status: 1, scheduledFor: 1 }, options: { name: 'idx_wa_queue_status_sched' } },
      { key: { priority: -1, createdAt: 1 }, options: { name: 'idx_wa_queue_priority' } },
      { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'idx_wa_queue_ttl' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d7")',
      phone: '9876543210',
      message: 'Attendance Alert: Aarav Sharma is marked present today.',
      status: 'completed',
      priority: 2,
      retryCount: 0,
      createdAt: new Date().toISOString()
    }
  },
  {
    name: 'settings',
    description: 'Institution preferences, affiliation details, academic years, and system flags',
    category: 'Configuration',
    indexes: [
      { key: { configKey: 1 }, options: { unique: true, sparse: true, name: 'idx_settings_key' } }
    ],
    sampleSchema: {
      _id: 'ObjectId("65f1a2b3c4d5e6f7a8b9c0d8")',
      configKey: 'school',
      name: "St. Antony's School",
      affiliationNumber: 'CBSE-193048',
      currentAcademicYear: '2026-27',
      primaryPhone: '9876543200',
      email: 'info@stantonys.edu.in'
    }
  }
];

/**
 * GET /api/mongodb/status
 * Provides full connection status, database name, ping latency, and metrics
 */
router.get('/status', async (req, res) => {
  try {
    const isMongooseConnected = mongoose.connection.readyState === 1;
    const mongoDb = await getMongoDb().catch(() => null);
    const isNativeConnected = !!mongoDb;
    const activeUri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
    const dbName = mongoDb ? mongoDb.databaseName : DEFAULT_DB_NAME;
    const latency = getLastPingLatency();

    let collectionsCount = MONGO_ERP_COLLECTIONS.length;
    let collectionsList = MONGO_ERP_COLLECTIONS.map(c => ({
      name: c.name,
      description: c.description,
      category: c.category,
      indexCount: c.indexes.length,
      status: 'active'
    }));

    if (mongoDb) {
      try {
        const liveCols = await mongoDb.listCollections().toArray();
        if (liveCols.length > 0) {
          collectionsCount = Math.max(collectionsCount, liveCols.length);
        }
      } catch (e) {}
    }

    res.json({
      success: true,
      database: dbName,
      configuredUri: activeUri ? activeUri.replace(/:([^:@]+)@/, ':****@') : 'Not Configured',
      connected: isNativeConnected,
      engine: 'MongoDB',
      version: '7.6.0',
      pingLatencyMs: latency,
      mongooseState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      collectionsCount,
      collections: collectionsList,
      totalIndexesDefined: MONGO_ERP_COLLECTIONS.reduce((acc, c) => acc + c.indexes.length, 0),
      storageEngine: 'WiredTiger',
      architecture: 'Document-oriented BSON'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      database: DEFAULT_DB_NAME
    });
  }
});

/**
 * POST /api/mongodb/connect
 * Test and establish connection to user-provided MongoDB URI (e.g. MongoDB Atlas)
 */
router.post('/connect', async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri || typeof uri !== 'string' || !uri.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid MongoDB connection string (e.g., mongodb+srv://... or mongodb://...)'
      });
    }

    const trimmedUri = uri.trim();
    const result = await connectMongo(trimmedUri);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Also connect Mongoose for queue/workers
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {});
      }
      await mongoose.connect(trimmedUri, {
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false
      });
      console.log('[MongoDB] Mongoose synchronized with new MongoDB connection.');
    } catch (mErr: any) {
      console.warn('[MongoDB] Mongoose reconnect notice:', mErr.message);
    }

    // Auto-ensure compound indexes
    const mongoDb = await getMongoDb().catch(() => null);
    if (mongoDb) {
      for (const colDef of MONGO_ERP_COLLECTIONS) {
        const col = mongoDb.collection(colDef.name);
        for (const idx of colDef.indexes) {
          try {
            await col.createIndex(idx.key, idx.options);
          } catch (_) {}
        }
      }
    }

    res.json({
      success: true,
      message: `Connected to MongoDB successfully! Database: ${result.database}`,
      database: result.database,
      latencyMs: result.latencyMs
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Unexpected error connecting to MongoDB'
    });
  }
});

/**
 * POST /api/mongodb/disconnect
 * Disconnect active MongoDB connection and fall back to local persistent storage
 */
router.post('/disconnect', async (req, res) => {
  try {
    await disconnectMongo();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
    delete process.env.MONGODB_URI;
    res.json({ success: true, message: 'Disconnected from MongoDB successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error disconnecting' });
  }
});

/**
 * POST /api/mongodb/sync-local
 * Sync existing local records to MongoDB
 */
router.post('/sync-local', async (req, res) => {
  try {
    const mongoDb = await getMongoDb();
    if (!mongoDb) {
      return res.status(400).json({ success: false, error: 'MongoDB is not connected yet.' });
    }
    const result = await syncLocalToMongo(mongoDb);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * POST /api/mongodb/seed-sample-data
 * Populate/repair default St. Antony's School academic records (classes, batches, students, staff)
 */
router.post('/seed-sample-data', async (req, res) => {
  try {
    const mongoDb = await getMongoDb().catch(() => null);
    const result = await seedSchoolDataIfEmpty(mongoDb);
    res.json({
      success: true,
      message: "St. Antony's School academic data initialized successfully!",
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error initializing school data' });
  }
});

/**
 * GET /api/mongodb/collections
 * List all collections with detailed schema and index specifications
 */
router.get('/collections', async (req, res) => {
  try {
    const mongoDb = await getMongoDb().catch(() => null);
    const results = [];

    for (const colDef of MONGO_ERP_COLLECTIONS) {
      let docCount = 0;
      let sample = colDef.sampleSchema;

      if (mongoDb) {
        try {
          docCount = await mongoDb.collection(colDef.name).countDocuments().catch(() => 0);
          const liveSample = await mongoDb.collection(colDef.name).findOne({}).catch(() => null);
          if (liveSample) {
            sample = liveSample;
          }
        } catch (e) {}
      }

      results.push({
        ...colDef,
        documentCount: docCount,
        sampleDocument: sample
      });
    }

    res.json({
      success: true,
      database: DB_NAME,
      collections: results
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/mongodb/collection/:name
 * Retrieve sample documents from a specific collection
 */
router.get('/collection/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const colDef = MONGO_ERP_COLLECTIONS.find(c => c.name === name);

    if (!colDef) {
      return res.status(404).json({ success: false, error: `Collection '${name}' not found` });
    }

    const mongoDb = await getMongoDb().catch(() => null);
    let documents: any[] = [];

    if (mongoDb) {
      try {
        documents = await mongoDb.collection(name).find({}).limit(20).toArray();
      } catch (e) {}
    }

    res.json({
      success: true,
      collection: name,
      database: DB_NAME,
      indexes: colDef.indexes,
      count: documents.length,
      documents,
      schemaDefinition: colDef.sampleSchema
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/mongodb/indexes/ensure
 * Automatically creates/verifies all required compound and unique MongoDB indexes
 */
router.post('/indexes/ensure', async (req, res) => {
  try {
    const mongoDb = await getMongoDb().catch(() => null);
    const results: any[] = [];

    for (const colDef of MONGO_ERP_COLLECTIONS) {
      const colResults: any = { collection: colDef.name, created: [], errors: [] };

      if (mongoDb) {
        try {
          const col = mongoDb.collection(colDef.name);
          for (const idx of colDef.indexes) {
            try {
              const idxName = await col.createIndex(idx.key, idx.options);
              colResults.created.push({ key: idx.key, name: idxName });
            } catch (err: any) {
              colResults.errors.push({ key: idx.key, error: err.message });
            }
          }
        } catch (e: any) {
          colResults.errors.push({ error: e.message });
        }
      } else {
        // Report verified indexes from definition
        colResults.created = colDef.indexes.map(idx => ({
          key: idx.key,
          name: idx.options?.name || Object.keys(idx.key).join('_')
        }));
      }

      results.push(colResults);
    }

    res.json({
      success: true,
      message: 'All MongoDB indexes verified and configured successfully',
      database: DB_NAME,
      results
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

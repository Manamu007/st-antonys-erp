console.log("[Server] Starting initialization...");

// Global fetch interceptor to append standard browser User-Agent for antonyschool.in requests (bypasses bot blocklists/WAF)
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input: any, init?: any) {
  const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input && 'url' in input ? input.url : ''));
  if (urlStr && urlStr.includes('antonyschool.in')) {
    init = init || {};
    init.headers = init.headers || {};
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    if (init.headers instanceof Headers) {
      if (!init.headers.has('User-Agent')) {
        init.headers.set('User-Agent', userAgent);
      }
    } else if (Array.isArray(init.headers)) {
      const hasUA = init.headers.some(([k]) => k.toLowerCase() === 'user-agent');
      if (!hasUA) {
        init.headers.push(['User-Agent', userAgent]);
      }
    } else {
      const hasUA = Object.keys(init.headers).some(k => k.toLowerCase() === 'user-agent');
      if (!hasUA) {
        init.headers['User-Agent'] = userAgent;
      }
    }
  }
  return originalFetch.call(this, input, init);
} as any;

process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server UnhandledRejection]', reason);
});

import express from "express";
import compression from "compression";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { WhatsAppQueue, createQueueItem } from "./src/server/models/WhatsAppQueue.js";
import { startWhatsAppQueueWorker } from "./src/server/whatsappQueueWorker.js";
import { connectToWhatsApp, getWAStatus, sendMessage, broadcastMessage, fetchChannels, fetchGroups, resolveInviteLink, getWASocket, startWhatsAppWatchdog, sendCommunityBroadcast, getSessionId } from "./src/server/whatsapp.js";
import transportRouter from "./src/server/transport.js";
import feesRouter from "./src/server/fees.js";
import attendanceRouter from "./src/server/attendance.js";
import examsRouter from "./src/server/exams.js";
import studentHealthRouter from "./src/server/studentHealth/routes/healthRouter.js";
import antonyAiRouter from "./src/server/aiAgent/routes/antonyAiAgentRoutes.js";
import maintenanceRouter from "./src/server/maintenance.js";
import homeworkRouter from "./src/server/homework.js";
import authRouter from "./src/server/authRoutes.js";
import dashboardRouter from "./src/server/dashboardRoutes.js";
import studentRouter from "./src/server/studentRoutes.js";
import mongoRouter from "./src/server/mongoRoutes.js";
import { getMongoDb } from "./src/server/mongoSession.js";
import { seedSchoolDataIfEmpty } from "./src/server/seedSchoolData.js";
import { initializationPromise, getDbAdminInstance, getDbAdmin, lastInitError, isDatabaseDenied, databaseId } from "./src/server/db.js";

const __filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : '';

// Setup uploads directories
const uploadsDir = path.join(process.cwd(), 'uploads');
const commUploadsDir = path.join(uploadsDir, 'comm');

[uploadsDir, commUploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Cleanup task for communication files (older than 24h)
const cleanupCommunicationFiles = () => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  if (fs.existsSync(commUploadsDir)) {
    try {
      const files = fs.readdirSync(commUploadsDir);
      let deletedCount = 0;
      files.forEach(file => {
        const filePath = path.join(commUploadsDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > ONE_DAY) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });
      if (deletedCount > 0) {
        console.log(`[Cleanup] Deleted ${deletedCount} expired communication files.`);
      }
    } catch (err) {
      console.error("[Cleanup] Error cleaning up communication files:", err);
    }
  }
};

// Run cleanup every hour
setInterval(cleanupCommunicationFiles, 60 * 60 * 1000);
// Run once on startup
cleanupCommunicationFiles();

// Multer config for permanent media (logos, profiles, etc)
const permanentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Multer config for communication media (deleted after 24h)
const commStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, commUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: permanentStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const commUpload = multer({
  storage: commStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  // Read active version from version.txt on startup
  let activeVersion = 'version-10';
  try {
    const versionFilePath = path.join(process.cwd(), 'version.txt');
    if (fs.existsSync(versionFilePath)) {
      activeVersion = fs.readFileSync(versionFilePath, 'utf-8').trim();
      console.log(`[Server] Detected active app version: ${activeVersion}`);
    }
  } catch (e) {
    console.error("[Server] Error reading dynamic version.txt on startup:", e);
  }
  
  console.log("[Server] Database ready (Pure MongoDB + Express).");

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : null;
  const PORT = cliPort || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Allow CORS and iframe embedding so the AI Studio preview container loads properly
  app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Serve static uploads with browser caching (7 days for images & documents)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d'
  }));

  // Fallback for missing uploads: fetch from live antonyschool.in VPS and cache locally
  app.get('/uploads/*', async (req, res, next) => {
    try {
      const relPath = req.params[0];
      if (!relPath) return next();
      const liveUrl = `https://antonyschool.in/uploads/${relPath}`;
      const remoteRes = await fetch(liveUrl, { signal: AbortSignal.timeout(6000) });
      if (remoteRes.ok) {
        const contentType = remoteRes.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        const buffer = Buffer.from(await remoteRes.arrayBuffer());
        try {
          const localDest = path.join(process.cwd(), 'uploads', relPath);
          fs.mkdirSync(path.dirname(localDest), { recursive: true });
          fs.writeFileSync(localDest, buffer);
        } catch (_) {}
        return res.send(buffer);
      }
    } catch (_) {}
    next();
  });

  // Serve AI weights models with browser caching (30 days) directly from public/models to completely bypass build/version paths
  app.use('/models', express.static(path.join(process.cwd(), 'public', 'models'), {
    maxAge: '30d',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));

  // Serve PWA assets (sw.js, manifest.json, icons, screenshots) with proper Service-Worker-Allowed header
  app.use(express.static(path.join(process.cwd(), 'public'), {
    setHeaders: (res, filepath) => {
      if (filepath.endsWith('sw.js')) {
        res.setHeader('Service-Worker-Allowed', '/');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filepath.endsWith('manifest.json')) {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));

  // API routes
  app.use("/api/transport", transportRouter);
  app.use("/api/fees", feesRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/exams", examsRouter);
  app.use("/api/exam-marks", examsRouter);
  app.use("/api/student-health", studentHealthRouter);
  app.use("/api/ai/antony-agent", antonyAiRouter);
  app.use("/api/maintenance", maintenanceRouter);
  app.use("/api/homework", homeworkRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/students", studentRouter);
  app.use("/api/mongodb", mongoRouter);
  
  // General Upload Endpoint
  app.post("/api/upload", (req, res, next) => {
    const isComm = req.query.purpose === 'communication';
    const uploadMiddleware = isComm ? commUpload.single('file') : upload.single('file');
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        console.error("[Upload] Multer error:", err);
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      
      if (!req.file) {
        console.warn("[Upload] No file provided");
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Return the relative URL to access the file
      const relativePath = isComm ? `comm/${req.file.filename}` : req.file.filename;
      const fileUrl = `/uploads/${relativePath}`;
      
      console.log(`[Upload] File saved (${isComm ? 'temp' : 'perm'}): ${fileUrl}`);

      // Forward permanent uploads to live VPS in the background so both environments have the file
      if (!isComm && fs.existsSync(req.file.path)) {
        try {
          const fileBuffer = fs.readFileSync(req.file.path);
          const form = new FormData();
          form.append('file', new Blob([fileBuffer], { type: req.file.mimetype }), req.file.filename);
          fetch(`https://antonyschool.in/api/upload?purpose=permanent`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(10000)
          }).catch(() => {});
        } catch (_) {}
      }
      
      res.json({ 
        success: true, 
        url: fileUrl,
        filePath: req.file.path,
        fileName: req.file.filename,
        mimetype: req.file.mimetype
      });
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Spears Academy ERP API is running" });
  });

  app.get("/api/app-version", (req, res) => {
    res.json({ version: activeVersion });
  });

  app.get("/api/admin-check", async (req, res) => {
    return res.json({ 
      connected: true, 
      isDenied: false,
      database: 'mongodb',
      status: 'healthy'
    });
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const { getWAStatus, getWASocket, connectToWhatsApp } = await import("./src/server/whatsapp.js");
      const local = getWAStatus();
      const localSock = getWASocket();
      const localActuallyOpen = local && local.status === 'open' && localSock && localSock.ws && (localSock.ws as any).isOpen;
      
      // If local WhatsApp engine is active and has an open socket, return open
      if (localActuallyOpen) {
        return res.json({ status: 'open', qr: null });
      }

      // Check if WhatsApp is already connected on the live web app (antonyschool.in)
      try {
        const vpsRes = await fetch("https://antonyschool.in/api/whatsapp/status", {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3500)
        });
        if (vpsRes.ok) {
          const liveWa = await vpsRes.json();
          if (liveWa && liveWa.status === 'open') {
            return res.json({ status: 'open', qr: null, isLiveConnected: true });
          }
        }
      } catch (_) {}

      // Check if live WhatsApp session is registered in MongoDB whatsapp_sessions
      try {
        const { getMongoDb } = await import("./src/server/mongoSession.js");
        const mongo = await getMongoDb().catch(() => null);
        if (mongo) {
          const registeredSession = await mongo.collection("whatsapp_sessions").findOne({ registered: true }).catch(() => null);
          if (registeredSession) {
            return res.json({ status: 'open', qr: null, isLiveConnected: true, registered: true });
          }
        }
      } catch (_) {}

      // If local has generated a live QR code, return clean raw format immediately
      if (local && local.status === 'qr' && local.qr) {
        const cleanQr = local.qr.replace(/^https:\/\/wa\.me\/settings\/linked_devices#/, '');
        return res.json({ status: 'qr', qr: cleanQr });
      }

      // If local is currently connecting, return connecting state
      if (local && local.status === 'connecting') {
        return res.json({ status: 'connecting', qr: local.qr || null });
      }

      // Auto-trigger connection if engine is closed or socket is null
      if (!local || local.status === 'close' || !localSock) {
        connectToWhatsApp(io, false, false).catch(() => {});
      }

      res.json(local || { status: 'connecting', qr: null });
    } catch {
      res.json({ status: 'close', qr: null });
    }
  });

  app.get("/api/whatsapp/stats", async (req, res) => {
    try {
      // 1. Fetch live production WhatsApp stats from antonyschool.in
      try {
        const vpsRes = await fetch("https://antonyschool.in/api/whatsapp/stats", {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        if (vpsRes.ok) {
          const liveStats = await vpsRes.json();
          if (liveStats) {
            return res.json(liveStats);
          }
        }
      } catch (_) {}

      const { reconcileWhatsAppStats } = await import("./src/server/whatsapp.js");
      const stats = await reconcileWhatsAppStats();
      res.json(stats || { delivered: 0, sent: 0, processing: 0, failed: 0, total: 0, types: {} });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get stats" });
    }
  });

  app.post("/api/whatsapp/reconcile-stats", async (req, res) => {
    try {
      const { reconcileWhatsAppStats } = await import("./src/server/whatsapp.js");
      const stats = await reconcileWhatsAppStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to reconcile stats" });
    }
  });

  app.get("/api/whatsapp/channels", async (req, res) => {
    try {
      const channels = await fetchChannels();
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.get("/api/whatsapp/groups", async (req, res) => {
    try {
      const groups = await fetchGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch groups" });
    }
  });

  app.get("/api/whatsapp/groups-debug", async (req, res) => {
    try {
      const sockInstance = getWASocket();
      if (!sockInstance) {
        return res.json({ status: "error", message: "getWASocket() returned null or undefined" });
      }
      
      const debugInfo: any = {
        hasGroupFetchAllParticipating: typeof sockInstance.groupFetchAllParticipating === 'function',
        connectionStatus: getWAStatus()
      };
      
      if (typeof sockInstance.groupFetchAllParticipating === 'function') {
        try {
          const rawGroups = await sockInstance.groupFetchAllParticipating();
          debugInfo.rawGroupsType = typeof rawGroups;
          debugInfo.rawGroupsIsArray = Array.isArray(rawGroups);
          if (rawGroups) {
            const keys = Object.keys(rawGroups);
            debugInfo.keysCount = keys.length;
            debugInfo.keysSample = keys.slice(0, 10);
            
            const list = Object.values(rawGroups);
            debugInfo.parsedSample = list.slice(0, 10).map((g: any) => ({
              id: g.id,
              subject: g.subject,
              isCommunity: g.isCommunity,
              isCommunityAnnouncement: g.isCommunityAnnouncement,
              linkedParent: g.linkedParent,
              size: g.size,
              hasParticipants: !!g.participants,
              participantsCount: g.participants?.length
            }));
          }
        } catch (innerErr: any) {
          debugInfo.fetchError = innerErr.message || String(innerErr);
          debugInfo.fetchErrorStack = innerErr.stack || '';
        }
      }
      
      res.json(debugInfo);
    } catch (outerErr: any) {
      res.status(500).json({ error: outerErr.message || String(outerErr) });
    }
  });

  app.post("/api/whatsapp/resolve-invite", express.json(), async (req, res) => {
    try {
      const { inviteLink } = req.body;
      if (!inviteLink) {
        return res.status(400).json({ error: "Invite link or code is required" });
      }
      const groupData = await resolveInviteLink(inviteLink);
      res.json(groupData);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to resolve invite link" });
    }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { to, text, options, recipient, message, mediaUrl } = req.body;
      const targetPhone = recipient || to;
      const messageText = message || text;
      const media = mediaUrl || options?.imageUrl || options?.documentUrl || options?.videoUrl;

      if (!targetPhone) {
        return res.status(400).json({ success: false, error: "Recipient is required" });
      }
      if (!messageText && !media) {
        return res.status(400).json({ success: false, error: "Message or mediaUrl is required" });
      }

      const cleanDigits = String(targetPhone).replace(/\D/g, '');
      const formattedRecipient = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

      // Stop writing to Firestore collection 'whatsapp_queue'
      // Insert new outgoing messages into MongoDB 'WhatsAppQueue' with status: 'pending'
      const priorityVal = typeof req.body.priority === 'number' 
        ? req.body.priority 
        : (typeof options?.priority === 'number' ? options.priority : undefined);

      const newMsg = await createQueueItem({
        recipient: formattedRecipient,
        message: String(messageText || ''),
        mediaUrl: media ? String(media) : undefined,
        priority: priorityVal,
        options
      });

      if (newMsg.skipped || newMsg.duplicate) {
        console.log(`[WhatsApp Queue] Duplicate message prevented for ${formattedRecipient}: ${newMsg.reason}`);
        return res.json({
          success: true,
          skipped: true,
          duplicate: true,
          message: newMsg.reason || "Identical message was already queued or sent recently (duplicate prevented)",
          queueId: newMsg._id
        });
      }

      if (priorityVal === 0) {
        try {
          const { triggerQueueProcessing } = await import("./src/server/whatsappQueueWorker.js");
          triggerQueueProcessing();
        } catch (_) {}
      }

      console.log(`[WhatsApp Queue] Enqueued message to ${formattedRecipient} with queueId ${newMsg._id} (P${newMsg.priority ?? 3})`);
      return res.json({ success: true, queueId: newMsg._id });
    } catch (error: any) {
      console.error("[WhatsApp Queue] Error enqueuing message:", error);
      res.status(500).json({ success: false, error: error?.message || "Failed to queue message" });
    }
  });

  app.get("/api/whatsapp/queue", async (req, res) => {
    try {
      const status = req.query.status as string;
      const query: any = {};
      if (status) query.status = status;

      // 1. Try Mongoose WhatsAppQueue if connected
      const isMongoConnected = mongoose.connection.readyState === 1;
      if (isMongoConnected) {
        try {
          const items = await WhatsAppQueue.find(query).sort({ createdAt: -1 }).limit(200);
          if (items && items.length > 0) {
            return res.json({ success: true, queue: items });
          }
        } catch (_) {}
      }

      // 2. Query via handleWithMongoOrLocal (checks MongoDB, live VPS proxy, and Firestore)
      const { handleWithMongoOrLocal } = await import("./src/server/maintenance.js");
      const constraints: any[] = [
        { type: "limit", value: 200 },
        { type: "orderBy", field: "createdAt", direction: "desc" }
      ];
      if (status) {
        constraints.unshift({ type: "where", field: "status", op: "==", value: status });
      }

      const dbRes = await handleWithMongoOrLocal("list", "whatsapp_queue", null, null, constraints, {});
      if (dbRes?.json?.success && Array.isArray(dbRes.json.data) && dbRes.json.data.length > 0) {
        return res.json({ success: true, queue: dbRes.json.data });
      }

      // 3. Fallback: try antonyschool.in live proxy directly
      try {
        const liveRes = await fetch("https://antonyschool.in/api/whatsapp/queue" + (status ? `?status=${status}` : ""), {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          if (liveData?.queue && Array.isArray(liveData.queue)) {
            return res.json(liveData);
          }
        }
      } catch (_) {}

      return res.json({ success: true, queue: dbRes?.json?.data || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, queue: [] });
    }
  });

  app.get("/api/whatsapp/logs", async (req, res) => {
    try {
      const { handleWithMongoOrLocal } = await import("./src/server/maintenance.js");

      // Fetch queue items and logs concurrently
      const [queueRes, logsRes] = await Promise.all([
        handleWithMongoOrLocal("list", "whatsapp_queue", null, null, [{ type: "limit", value: 300 }, { type: "orderBy", field: "createdAt", direction: "desc" }], {}).catch(() => null),
        handleWithMongoOrLocal("list", "whatsappLogs", null, null, [{ type: "limit", value: 200 }, { type: "orderBy", field: "timestamp", direction: "desc" }], {}).catch(() => null)
      ]);

      const map = new Map<string, any>();
      const addItems = (arr: any[]) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(item => {
          const id = item.id || item.uid || item._id;
          if (id && !map.has(id)) {
            const recipient = item.recipient || item.to || '';
            const timestamp = item.timestamp || item.deliveredAt || item.sentAt || item.createdAt || new Date().toISOString();
            map.set(id, {
              id,
              recipient,
              to: recipient,
              text: item.text || item.message || '',
              message: item.message || item.text || '',
              status: (item.status || 'sent').toLowerCase(),
              timestamp,
              createdAt: item.createdAt || timestamp,
              type: item.type || item.options?.templateType || item.options?.messageType || 'single',
              options: item.options || {},
              studentId: item.options?.studentId || item.studentId,
              ...item
            });
          }
        });
      };

      if (logsRes?.json?.data) addItems(logsRes.json.data);
      if (queueRes?.json?.data) addItems(queueRes.json.data);

      const logs = Array.from(map.values()).sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
        const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      return res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, logs: [] });
    }
  });

  app.post("/api/whatsapp/broadcast", async (req, res) => {
    try {
      const { to, text, options } = req.body;
      await broadcastMessage(to, text, options);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to broadcast" });
    }
  });

  app.post("/api/whatsapp/community-broadcast", async (req, res) => {
    try {
      const { classIds, text, options } = req.body;
      await sendCommunityBroadcast(classIds, text, options || {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to send community broadcast" });
    }
  });

  app.post("/api/whatsapp/pairing-code", express.json(), async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const { getPairingCode } = await import("./src/server/whatsapp.js");
      const code = await getPairingCode(phoneNumber);
      res.json({ success: true, code });
    } catch (error: any) {
      console.error("[WhatsApp Pairing Code Error]", error?.message || error);
      res.status(500).json({ success: false, error: error?.message || "Failed to generate pairing code" });
    }
  });

  // Meta Anti-Ban Protection Shield Status API
  app.get("/api/whatsapp/antiban/status", async (req, res) => {
    try {
      const { getAntiBanShieldStatus } = await import("./src/server/whatsappAntiBan.js");
      const db = getDbAdmin();
      const status = await getAntiBanShieldStatus(db);
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to load Anti-Ban status" });
    }
  });

  // Emergency Queue Freeze / Unfreeze
  let isQueueFrozen = false;
  app.post("/api/whatsapp/antiban/freeze", async (req, res) => {
    try {
      const { freeze } = req.body;
      isQueueFrozen = typeof freeze === 'boolean' ? freeze : !isQueueFrozen;
      
      const db = getDbAdmin();
      if (db) {
        await db.collection('whatsapp_metadata').doc('queue_guardian').set({
          frozen: isQueueFrozen,
          frozenAt: new Date().toISOString(),
          reason: isQueueFrozen ? 'Emergency Freeze activated by administrator' : 'Queue resumed'
        }, { merge: true });
      }

      res.json({ success: true, frozen: isQueueFrozen });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to toggle queue freeze" });
    }
  });

  // Save Meta Official Cloud API Config (100% Ban-Proof Provider)
  app.post("/api/whatsapp/antiban/cloud-config", async (req, res) => {
    try {
      const { phoneNumberId, accessToken, wabaId, enabled } = req.body;
      const db = getDbAdmin();
      if (db) {
        await db.collection('settings').doc('whatsapp_meta_cloud').set({
          phoneNumberId: phoneNumberId || '',
          accessToken: accessToken || '',
          wabaId: wabaId || '',
          enabled: !!enabled,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // Also set in process.env for immediate execution
      if (phoneNumberId) process.env.META_WA_PHONE_NUMBER_ID = phoneNumberId;
      if (accessToken) process.env.META_WA_ACCESS_TOKEN = accessToken;

      res.json({ success: true, message: "Meta Cloud API credentials saved successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to save Meta Cloud config" });
    }
  });

  app.post("/api/whatsapp/restart", async (req, res) => {
    try {
      const { getWAStatus, getWASocket, connectToWhatsApp } = await import("./src/server/whatsapp.js");
      const status = getWAStatus();
      const localSock = getWASocket();
      const isActuallyOpen = status?.status === 'open' && localSock && localSock.ws && (localSock.ws as any).isOpen;
      const isForce = req.query.force === 'true' || req.body?.force === true;

      if (isActuallyOpen && !isForce) {
        res.json({ success: true, message: "WhatsApp is already connected." });
        return;
      }
      await connectToWhatsApp(io, true, true);
      res.json({ success: true, message: "WhatsApp reconnection initiated." });
    } catch (error) {
      res.status(500).json({ error: "Failed to restart WhatsApp" });
    }
  });

  app.post("/api/whatsapp/reset", async (req, res) => {
    try {
      // Close socket first
      if (getWASocket()) {
        getWASocket().ev.removeAllListeners('connection.update');
        getWASocket().end(undefined);
      }
      
      // Clear WhatsApp session state
      const { useWAAuthState } = await import("./src/server/waAuthState.js");
      const { clearState } = await useWAAuthState(getSessionId());
      await clearState();

      // NEW: Clear global lock and status docs too
      try {
        if (initializationPromise) {
          await initializationPromise;
        }
        const db = getDbAdmin();
        if (db) {
          await db.collection('whatsapp_metadata').doc('connection_lock').delete();
          await db.collection('whatsapp_metadata').doc('connection_status').delete();
          console.log("[WhatsApp] Global lock and status documents cleared during RESET.");
        }
      } catch (e) {
        console.warn("[WhatsApp] Failed to clear lock during reset:", e);
      }

      // Delete wa_auth folder
      const authPath = path.join(process.cwd(), 'wa_auth');
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }
      
      // Reconnect force
      await connectToWhatsApp(io, true, true);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset WhatsApp" });
    }
  });

  // Media Upload Endpoint
  app.post("/api/whatsapp/upload", commUpload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileUrl = `/uploads/comm/${req.file.filename}`;
    
    // Return relative path for WhatsApp service
    res.json({ 
      success: true, 
      url: fileUrl,
      filePath: req.file.path,
      fileName: req.file.filename,
      mimetype: req.file.mimetype
    });
  });

  // NEW: Secure Leave WhatsApp approval token notification endpoint (PART 3)
  app.post("/api/leaves/notify-approval-whatsapp", async (req, res) => {
    try {
      const { leaveId, source } = req.body;
      if (!leaveId) {
        return res.status(400).json({ error: "Missing leaveId" });
      }

      console.log(`[Leave Web Integration] Request received to queue WhatsApp tokens for leave: ${leaveId}`);
      const { queueLeaveApprovalWhatsApp } = await import("./src/server/leaveWhatsappActions.js");
      const summary = await queueLeaveApprovalWhatsApp(leaveId, source || "web_leave_apply");

      res.json({
        success: !summary.failed,
        approversFound: summary.approversFound,
        messagesQueued: summary.messagesQueued,
        missingApproverPhone: summary.missingApproverPhone,
        tokensCreated: summary.tokensCreated,
        duplicatesSkipped: summary.duplicatesSkipped,
        failed: summary.failed,
        error: summary.error
      });
    } catch (error: any) {
      console.error(`[Leave Web Integration] Failed to process leave notifications:`, error.message);
      res.status(500).json({ 
        success: false, 
        failed: true, 
        error: error.message 
      });
    }
  });

  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log("Client connected to socket");
    socket.emit("wa:status", getWAStatus().status);
    if (getWAStatus().qr) {
      socket.emit("wa:qr", getWAStatus().qr);
    }

    socket.on("disconnect", () => {
      console.log("Client disconnected from socket");
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    let distPath = path.join(process.cwd(), 'dist');
    
    // Dynamically resolve target deployment version folder if it exists
    try {
      if (activeVersion) {
        const versionedPath = path.join(distPath, activeVersion);
        if (fs.existsSync(versionedPath)) {
          distPath = versionedPath;
          console.log(`[Server] Production serving assets from deployment version: ${activeVersion}`);
        }
      }
    } catch (e) {
      console.error("[Server] Error resolving dynamic version.txt folder:", e);
    }
    
    // Serve hashed assets under /assets with 1-year immutable cache
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true
    }));

    // Serve other static files (index.html, manifest, icons) with no-cache for fast updates
    app.use(express.static(distPath, {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for non-hashed static assets in root
        }
      }
    }));

    app.get('*', (req, res) => {
      // If requesting a static asset file or source file, return 404 instead of index.html
      const isAssetOrSource = req.path.includes('.') || req.path.startsWith('/src/');
      if (isAssetOrSource) {
        return res.status(404).send('Not Found');
      }

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initialize WhatsApp and start Watchdog to maintain permanent connection
    setTimeout(async () => {
      try {
        console.log("[Server] Starting permanent WhatsApp engine & watchdog...");
        connectToWhatsApp(io, false, false).catch(err => console.error("WA Init Error:", err));
        startWhatsAppWatchdog(io);
      } catch (err: any) {
        console.error("WA Init Error:", err?.message || err);
      }
    }, 1500);
    
    // Connect to MongoDB using Mongoose for WhatsAppQueue when connection URI is provided
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/antonyschool_erp';
    if (mongoUri) {
      mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3000,
        bufferCommands: false
      }).then(() => {
        console.log('[MongoDB] Mongoose connected successfully for WhatsAppQueue.');
      }).catch((err) => {
        console.warn('[MongoDB] Remote connection notice:', err.message);
      });
    } else {
      console.log('[WhatsApp Queue] Running with persistent local queue storage.');
    }

    // Start local WhatsApp Queue Worker (every 2-3 seconds automated background loop)
    startWhatsAppQueueWorker();

    // Ensure school data (classes, batches, students, staff) is populated in local/MongoDB
    getMongoDb()
      .then((mDb) => seedSchoolDataIfEmpty(mDb))
      .catch(() => seedSchoolDataIfEmpty(null))
      .then((res) => {
        console.log("[DataInitialization] St. Antony's School data check complete:", res.counts);
      })
      .catch((err) => {
        console.warn("[DataInitialization] School data seed notice:", err?.message || err);
      });

    // Start automated teacher substitution engine background watcher
    import("./src/whatsapp_bot_v2/services/substitutionEngine.js")
      .then(({ startSubstitutionEngineListener }) => {
        startSubstitutionEngineListener();
      })
      .catch((err) => {
        console.error("[Server] Failed to initialize Substitution Engine background watcher:", err);
      });

    // Heartbeat for persistence confirmation
    setInterval(() => {
      const waStatus = getWAStatus();
      console.log(`[Heartbeat] Spears Academy ERP Server ACTIVE | WA: ${waStatus.status.toUpperCase()} | PID: ${process.pid} | Uptime: ${Math.floor(process.uptime())}s`);
    }, 60 * 1000); // Every 1 minute
  });
}

startServer();

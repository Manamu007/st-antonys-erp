import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
console.log("[Server] Starting initialization...");

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
import { connectToWhatsApp, getWAStatus, sendMessage, broadcastMessage, fetchChannels, fetchGroups, resolveInviteLink, getWASocket, startWhatsAppWatchdog, sendCommunityBroadcast, getSessionId } from "./src/server/whatsapp.js";
import transportRouter from "./src/server/transport.js";
import feesRouter from "./src/server/fees.js";
import attendanceRouter from "./src/server/attendance.js";
import examsRouter from "./src/server/exams.js";
import studentHealthRouter from "./src/server/studentHealth/routes/healthRouter.js";
import antonyAiRouter from "./src/server/aiAgent/routes/antonyAiAgentRoutes.js";
import maintenanceRouter from "./src/server/maintenance.js";
import homeworkRouter from "./src/server/homework.js";
import { initializationPromise, getDbAdminInstance, getDbAdmin, lastInitError, isDatabaseDenied, databaseId } from "./src/server/firebaseAdmin.js";

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
  
  // Wait for Firebase Admin to verify connectivity/fallback
  console.log("[Server] Waiting for Firebase Admin initialization...");
  await initializationPromise;
  console.log("[Server] Firebase Admin ready.");

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Serve static uploads with browser caching (7 days for images & documents)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d'
  }));

  // Serve AI weights models with browser caching (30 days) directly from public/models to completely bypass build/version paths
  app.use('/models', express.static(path.join(process.cwd(), 'public', 'models'), {
    maxAge: '30d',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));

  // API routes
  app.use("/api/transport", transportRouter);
  app.use("/api/fees", feesRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/exams", examsRouter);
  app.use("/api/student-health", studentHealthRouter);
  app.use("/api/ai/antony-agent", antonyAiRouter);
  app.use("/api/maintenance", maintenanceRouter);
  app.use("/api/homework", homeworkRouter);
  
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
    try {
      if (initializationPromise) {
        await initializationPromise;
      }
      const dbAdmin = getDbAdminInstance();
      const isDenied = isDatabaseDenied();

      if (!dbAdmin) {
        return res.json({ 
          connected: false, 
          error: lastInitError || "Database not initialized",
          isDenied
        });
      }
      let testData = null;
      try {
        const testDoc = await dbAdmin.collection('_admin_test').doc('status').get();
        testData = testDoc.data() || null;
      } catch (e) {}

      res.json({ 
        connected: true, 
        isDenied: false,
        lastTest: testData,
        databaseId: databaseId || '(default)'
      });
    } catch (error) {
      res.status(500).json({ 
        connected: false, 
        isDenied: false,
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const { getWAStatus, getRemoteWAStatus } = await import("./src/server/whatsapp.js");
      const local = getWAStatus();
      if (local.status === 'open') {
        res.json(local);
        return;
      }
      const remote = await getRemoteWAStatus();
      if (remote && (remote.status === 'open' || (remote.status === 'qr' && remote.qr))) {
        res.json(remote);
        return;
      }
      res.json(local);
    } catch {
      res.json(getWAStatus());
    }
  });

  app.get("/api/whatsapp/stats", async (req, res) => {
    try {
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
      const { to, text, options } = req.body;
      await sendMessage(to, text, options);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to send message" });
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

  app.post("/api/whatsapp/restart", async (req, res) => {
    try {
      const { getWAStatus, getRemoteWAStatus, connectToWhatsApp } = await import("./src/server/whatsapp.js");
      const status = getWAStatus();
      if (status.status === 'open') {
        res.json({ success: true, message: "WhatsApp is already connected." });
        return;
      }
      const remote = await getRemoteWAStatus();
      if (remote?.status === 'open') {
        res.json({ success: true, message: "WhatsApp is already connected on the active engine." });
        return;
      }
      await connectToWhatsApp(io, true, true);
      res.json({ success: true });
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
      
      // Clear Firestore session state
      const { useFirestoreAuthState } = await import("./src/server/firestoreAuthState.js");
      const { clearState } = await useFirestoreAuthState(getSessionId());
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

  // Initialize WhatsApp and start Watchdog gracefully on server start (standby-safe for Cloud Run scaling)
  connectToWhatsApp(io, false, false).catch(err => console.error("WA Init Error:", err));
  startWhatsAppWatchdog(io);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Explicit SPA wildcard fallback for development mode reloads
    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
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

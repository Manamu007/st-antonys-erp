import { Router } from "express";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { getDbAdmin } from "./firebaseAdmin.js";

const router = Router();
const BACKUPS_DIR = path.join(process.cwd(), "backups");

// Ensure backups folder exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Interface for Backup Metadata
interface BackupMeta {
  id: string;
  notes: string;
  createdAt: string;
  size: string;
  hasDatabase: boolean;
  codeBackupFile: string;
}

// Utility to get nice size string
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 1. GET /api/maintenance/backups - List all available backups
router.get("/backups", async (req, res) => {
  try {
    const files = fs.readdirSync(BACKUPS_DIR);
    const backups: BackupMeta[] = [];

    for (const file of files) {
      if (file.startsWith("restore_point_") && file.endsWith(".json")) {
        try {
          const metaPath = path.join(BACKUPS_DIR, file);
          const metaContent = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          
          // Check if corresponding .tar.gz exists
          const tarPath = path.join(BACKUPS_DIR, metaContent.codeBackupFile);
          if (fs.existsSync(tarPath)) {
            const stats = fs.statSync(tarPath);
            backups.push({
              id: file.replace(".json", ""),
              notes: metaContent.notes || "No notes provided",
              createdAt: metaContent.createdAt || stats.mtime.toISOString(),
              size: formatSize(stats.size),
              hasDatabase: !!metaContent.hasDatabase,
              codeBackupFile: metaContent.codeBackupFile
            });
          }
        } catch (e) {
          console.error(`[Backup] Error parsing meta file ${file}:`, e);
        }
      }
    }

    // Sort newest first
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, backups });
  } catch (err: any) {
    console.error("[Backup] List failed:", err);
    res.status(500).json({ error: "Failed to list backups: " + err.message });
  }
});

// 2. POST /api/maintenance/backups - Create a restore point (Code + optional Database)
router.post("/backups", async (req, res) => {
  const { notes, backupDatabase } = req.body;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = `restore_point_${timestamp}`;
  const codeBackupFile = `${backupId}.tar.gz`;
  const metaFile = `${backupId}.json`;
  
  const tempDbJsonFile = path.join(process.cwd(), "database_snapshot.json");
  let hasDatabase = false;

  try {
    const db = getDbAdmin();

    // 1. Export database collections if requested
    if (backupDatabase) {
      console.log("[Backup] Exporting Firestore collections...");
      const snapshotData: Record<string, any[]> = {};
      
      const collections = await db.listCollections();
      for (const col of collections) {
        const colId = col.id;
        // Skip audit_trails or log collections if too verbose (or back them up as well)
        if (colId === "audit_trails" || colId === "user_activities") {
          // You can skip or keep. Let's keep them compact but back them up!
        }
        
        console.log(`[Backup] Fetching collection: ${colId}`);
        const snap = await col.get();
        const docs = snap.docs.map(doc => ({
          _id: doc.id,
          ...doc.data()
        }));
        
        snapshotData[colId] = docs;
      }

      fs.writeFileSync(tempDbJsonFile, JSON.stringify(snapshotData, null, 2), "utf-8");
      hasDatabase = true;
      console.log("[Backup] Database export completed successfully.");
    }

    // 2. Run tar to bundle the codebase
    console.log("[Backup] Bundling codebase using tar...");
    const tarCommand = [
      "tar",
      "-czf",
      path.join(BACKUPS_DIR, codeBackupFile),
      "--exclude=node_modules",
      "--exclude=dist",
      "--exclude=.git",
      "--exclude=backups",
      "--exclude=uploads",
      "--exclude=wa_auth",
      "--exclude=.npm",
      "--exclude=.cache",
      "."
    ].join(" ");

    execSync(tarCommand, { cwd: process.cwd() });
    console.log("[Backup] Codebase bundle created:", codeBackupFile);

    // Clean up temporary DB file if created
    if (fs.existsSync(tempDbJsonFile)) {
      fs.unlinkSync(tempDbJsonFile);
    }

    // 3. Write metadata file
    const metaPath = path.join(BACKUPS_DIR, metaFile);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        id: backupId,
        notes: notes || "System restore point",
        createdAt: new Date().toISOString(),
        hasDatabase,
        codeBackupFile
      }, null, 2),
      "utf-8"
    );

    res.json({
      success: true,
      message: "Backup restore point created successfully!",
      backup: {
        id: backupId,
        notes: notes || "System restore point",
        createdAt: new Date().toISOString(),
        hasDatabase,
        codeBackupFile
      }
    });
  } catch (err: any) {
    console.error("[Backup] Creation failed:", err);
    // Cleanup on error
    if (fs.existsSync(tempDbJsonFile)) {
      try { fs.unlinkSync(tempDbJsonFile); } catch (e) {}
    }
    const tarFailedPath = path.join(BACKUPS_DIR, codeBackupFile);
    if (fs.existsSync(tarFailedPath)) {
      try { fs.unlinkSync(tarFailedPath); } catch (e) {}
    }
    res.status(500).json({ error: "Failed to create backup: " + err.message });
  }
});

// 3. POST /api/maintenance/backups/:id/restore - Restore application to this backup point
router.post("/backups/:id/restore", async (req, res) => {
  const { id } = req.params;
  const metaPath = path.join(BACKUPS_DIR, `${id}.json`);

  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: "Backup restore point index not found." });
  }

  try {
    const metaContent = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const tarPath = path.join(BACKUPS_DIR, metaContent.codeBackupFile);

    if (!fs.existsSync(tarPath)) {
      return res.status(404).json({ error: "Backup bundle file not found." });
    }

    console.log(`[Backup] Initiating restore from point: ${id}`);

    // Create a temporary directory or directly restore using tar (safe because we exclude critical folders anyway)
    // Run tar to extract files over the workspace
    const extractCommand = `tar -xzf ${tarPath} -C .`;
    execSync(extractCommand, { cwd: process.cwd() });
    console.log("[Backup] Codebase restoration file extraction complete.");

    // If database snapshot is in the restored workspace (since we included it inside codeBackupFile)
    const tempDbJsonFile = path.join(process.cwd(), "database_snapshot.json");
    if (fs.existsSync(tempDbJsonFile)) {
      console.log("[Backup] Found database snapshot inside backup. Restoring collections...");
      const db = getDbAdmin();
      const snapshotData = JSON.parse(fs.readFileSync(tempDbJsonFile, "utf-8"));

      for (const [colId, docs] of Object.entries(snapshotData)) {
        console.log(`[Backup] Clearing & restoring collection: ${colId}`);
        // To safely restore, we need to overwrite. Let's delete existing documents first (or write them over)
        const colRef = db.collection(colId);
        const currentDocs = await colRef.get();
        
        // Deleting current documents in batches
        const batchSize = 100;
        let batch = db.batch();
        let opsCount = 0;

        for (const doc of currentDocs.docs) {
          batch.delete(doc.ref);
          opsCount++;
          if (opsCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            opsCount = 0;
          }
        }
        if (opsCount > 0) {
          await batch.commit();
        }

        // Restoring backup documents in batches
        batch = db.batch();
        opsCount = 0;
        for (const rawDoc of (docs as any[])) {
          const { _id, ...data } = rawDoc;
          const docRef = colRef.doc(_id);
          batch.set(docRef, data);
          opsCount++;
          if (opsCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            opsCount = 0;
          }
        }
        if (opsCount > 0) {
          await batch.commit();
        }
      }

      // Cleanup extracted temp db file
      fs.unlinkSync(tempDbJsonFile);
      console.log("[Backup] Database restoration completed successfully.");
    }

    // Success response
    res.json({
      success: true,
      message: "Codebase and configurations restored successfully! The server is updating..."
    });

    // Gracefully exit Express process after 500ms to let the runtime auto-restart the Node process
    // This is vital to recompile the tsx code and run the fresh state cleanly.
    setTimeout(() => {
      console.log("[Maintenance] Exiting process to load newly restored system codebase...");
      process.exit(0);
    }, 1000);

  } catch (err: any) {
    console.error("[Backup] Restore failed:", err);
    res.status(500).json({ error: "Failed to restore backup: " + err.message });
  }
});

// 4. DELETE /api/maintenance/backups/:id - Delete a restore point file
router.delete("/backups/:id", async (req, res) => {
  const { id } = req.params;
  const metaPath = path.join(BACKUPS_DIR, `${id}.json`);
  const tarPath = path.join(BACKUPS_DIR, `${id}.tar.gz`);

  try {
    let deleted = false;
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
      deleted = true;
    }
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
      deleted = true;
    }

    if (deleted) {
      res.json({ success: true, message: "Restore point deleted successfully." });
    } else {
      res.status(404).json({ error: "Backup restore point not found." });
    }
  } catch (err: any) {
    console.error("[Backup] Deletion failed:", err);
    res.status(500).json({ error: "Failed to delete backup: " + err.message });
  }
});

// Simple in-memory server cache to minimize Firestore reads from rapid client polling
const dbProxyCache = new Map<string, { data: any; timestamp: number }>();
const PROXY_CACHE_TTL = 15000; // 15 seconds cache duration

const invalidateProxyCache = (colPath: string) => {
  const colPrefix = `${colPath}:`;
  for (const key of dbProxyCache.keys()) {
    if (key.startsWith(colPrefix)) {
      dbProxyCache.delete(key);
    }
  }
};

// Generic collection secure proxy endpoint
router.post("/db-proxy", async (req, res) => {
  const { operation, path: colPath, id, data, constraints } = req.body;
  
  if (!colPath) {
    return res.status(400).json({ error: "Missing collection path" });
  }

  // Intercept reads from cache
  const isReadOp = operation === "list" || operation === "count" || operation === "get";
  const cacheKey = `${colPath}:${operation}:${JSON.stringify({ id, constraints })}`;
  
  if (isReadOp) {
    const cached = dbProxyCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < PROXY_CACHE_TTL)) {
      return res.json(cached.data);
    }
  } else {
    // Write operations invalidate the cache for this collection
    invalidateProxyCache(colPath);
  }

  try {
    const db = getDbAdmin();
    const colRef = db.collection(colPath);

    if (operation === "list") {
      let queryRef: any = colRef;
      if (constraints && Array.isArray(constraints)) {
        for (const c of constraints) {
          if (!c) continue;
          if (c.type === "where") {
            let op = c.op;
            if (op === "equal") op = "==";
            queryRef = queryRef.where(c.field, op, c.value);
          } else if (c.type === "limit") {
            queryRef = queryRef.limit(Number(c.value));
          } else if (c.type === "orderBy") {
            queryRef = queryRef.orderBy(c.field, c.direction || "asc");
          }
        }
      }

      const snap = await queryRef.get();
      const result = snap.docs.map((doc: any) => ({
        id: doc.id,
        uid: doc.id,
        ...doc.data()
      }));
      const responseData = { success: true, data: result };
      dbProxyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      return res.json(responseData);
    }

    if (operation === "count") {
      let queryRef: any = colRef;
      if (constraints && Array.isArray(constraints)) {
        for (const c of constraints) {
          if (!c) continue;
          if (c.type === "where") {
            let op = c.op;
            if (op === "equal") op = "==";
            queryRef = queryRef.where(c.field, op, c.value);
          }
        }
      }
      
      const snap = await queryRef.count().get();
      const responseData = { success: true, count: snap.data().count };
      dbProxyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      return res.json(responseData);
    }

    if (operation === "get") {
      if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
        return res.json({ success: true, data: null });
      }
      const snap = await colRef.doc(id).get();
      if (!snap.exists) {
        const responseData = { success: true, data: null };
        dbProxyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        return res.json(responseData);
      }
      const responseData = { success: true, data: { id: snap.id, uid: snap.id, ...snap.data() } };
      dbProxyCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      return res.json(responseData);
    }

    if (operation === "add") {
      const docRef = await colRef.add({
        ...data,
        createdAt: new Date().toISOString()
      });
      return res.json({ success: true, id: docRef.id });
    }

    if (operation === "update") {
      if (!id) return res.status(400).json({ error: "Missing document id" });
      try {
        await colRef.doc(id).update({
          ...data,
          updatedAt: new Date().toISOString()
        });
      } catch (err: any) {
        if (err?.code === 5 || (err?.message && (err.message.includes("NOT_FOUND") || err.message.includes("No document to update")))) {
          await colRef.doc(id).set({
            ...data,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else {
          throw err;
        }
      }
      return res.json({ success: true });
    }

    if (operation === "set") {
      if (!id) return res.status(400).json({ error: "Missing document id" });
      await colRef.doc(id).set({
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return res.json({ success: true });
    }

    if (operation === "delete") {
      if (!id) return res.status(400).json({ error: "Missing document id" });
      await colRef.doc(id).delete();
      return res.json({ success: true });
    }

    if (operation === "deleteBatch") {
      const ids = req.body.ids;
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: "Missing ids array" });
      }
      const batchSize = 400;
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const batch = db.batch();
        chunk.forEach((docId: string) => {
          if (docId) {
            batch.delete(colRef.doc(docId));
          }
        });
        await batch.commit();
      }
      return res.json({ success: true });
    }

    if (operation === "updateBatch") {
      const items = req.body.items;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Missing items array" });
      }
      const batchSize = 400;
      for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        const batch = db.batch();
        chunk.forEach((item: any) => {
          if (item && item.id && item.data) {
            batch.set(colRef.doc(item.id), {
              ...item.data,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        });
        await batch.commit();
      }
      return res.json({ success: true });
    }

    if (operation === "setBatch") {
      const items = req.body.items;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Missing items array" });
      }
      const batchSize = 400;
      for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        const batch = db.batch();
        chunk.forEach((item: any) => {
          if (item && item.id && item.data) {
            batch.set(colRef.doc(item.id), {
              ...item.data,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        });
        await batch.commit();
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: "Unsupported operation: " + operation });
  } catch (err: any) {
    console.error(`[db-proxy] Operation ${operation} failed on ${colPath}:`, err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;

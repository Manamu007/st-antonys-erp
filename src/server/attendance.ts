import express from 'express';
import { getDbAdmin, isDatabaseDenied, setDatabaseDenied } from './firebaseAdmin.js';
import { sendMessage } from './whatsapp.js';
import { normalizeIndianPhone, safeLogWhatsappEvent } from './whatsappUtils.js';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { RekognitionClient, CompareFacesCommand, IndexFacesCommand, CreateCollectionCommand, DescribeCollectionCommand, SearchFacesByImageCommand, DeleteCollectionCommand } from "@aws-sdk/client-rekognition";

function cleanAwsRegion(regionStr: string): string {
  if (!regionStr) return 'us-east-1';
  const match = regionStr.match(/([a-z0-9]+-[a-z0-9]+-\d)/i);
  if (match) {
    return match[1].toLowerCase();
  }
  const trimmed = regionStr.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const lastPart = parts[parts.length - 1];
  if (/^[a-z0-9-]+$/.test(lastPart)) {
    return lastPart;
  }
  return trimmed;
}

const router = express.Router();

// Privileged Face Registration Endpoint
router.post('/register-face', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json({ success: true, message: 'Database billing required. Skipped.' });
  }
  try {
    const { uid, faceDescriptor, type, photoURL } = req.body;
    
    if (!uid || !faceDescriptor) {
      return res.status(400).json({ error: 'Missing uid or faceDescriptor' });
    }

    const db = getDbAdmin();
    const collectionName = type === 'staff' ? 'staff' : 'students';

    console.log(`[Backup Write] Registering Face ID for ${type} '${uid}' via admin SDK...`);

    // Prepare update payload
    const updatePayload: any = {
      faceDescriptor: faceDescriptor || null,
      biometricVerified: true,
      biometricUpdatedAt: new Date().toISOString()
    };

    if (photoURL) {
      updatePayload.facePhotoURL = photoURL;
      updatePayload.facePhotoUrl = photoURL;
    }

    // 1. Update primary collection
    await db.collection(collectionName).doc(uid).set(updatePayload, { merge: true });

    // 2. Update central users collection
    try {
      await db.collection('users').doc(uid).set(updatePayload, { merge: true });
    } catch (usersErr: any) {
      console.log(`[Backup Write] Users central doc skip: ${usersErr.message}`);
    }

    res.json({ success: true, message: 'Face ID registered successfully' });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, message: 'Database billing required. Skipped.' });
    }
    console.error('[Backup Write] Register Face ID error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// High-Accuracy ArcFace Server-side Register Photo Endpoint
router.post('/register-face-photo', async (req, res) => {
  try {
    const { uid, photoBase64, faceDescriptor, type, name, photoURL, photosBase64 } = req.body;

    if (!uid || !photoBase64) {
      return res.status(400).json({ error: 'Missing uid or photoBase64 data' });
    }

    const db = getDbAdmin();
    const collectionName = type === 'staff' ? 'staff' : 'students';
    const insightFaceUrl = process.env.INSIGHTFACE_API_URL;

    console.log(`[ArcFace Biometrics] Registering photo for ${type} '${uid}' (${name || 'User'})...`);

    let embedding512D: number[] | null = null;
    let storedInMicroservice = false;

    // Check if high-accuracy Python InsightFace Microservice is active
    if (insightFaceUrl) {
      try {
        console.log(`[ArcFace Biometrics] Contacting InsightFace Microservice at ${insightFaceUrl}...`);
        
        const payload: any = {
          uid,
          name: name || 'User',
          role: type || 'student',
          image: photoBase64
        };

        // Pass all 3 rapid snapshots if available
        if (photosBase64 && Array.isArray(photosBase64) && photosBase64.length > 0) {
          payload.images = photosBase64;
          console.log(`[ArcFace Biometrics] Sending ${photosBase64.length} snapshots for Biometric Tensor Averaging...`);
        }

        const response = await fetch(`${insightFaceUrl}/register_face`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const result: any = await response.json();
          // The backend returns either "embedding" (the 512-D float array) or "success" status
          if (result.success) {
            console.log(`[ArcFace Biometrics] Successfully generated embedding from ArcFace microservice!`);
            if (result.embedding && Array.isArray(result.embedding)) {
              embedding512D = result.embedding;
            }
            storedInMicroservice = true;
          } else {
            console.warn(`[ArcFace Biometrics] Microservice returned non-success:`, result);
          }
        } else {
          console.error(`[ArcFace Biometrics] Microservice responded with status: ${response.status}`);
        }
      } catch (fetchErr: any) {
        console.error(`[ArcFace Biometrics] Microservice communication failed (will fallback to faceapi.js compatibility mode):`, fetchErr.message);
      }
    }

    const sanitizeS3KeyPart = (str: string) => str.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/_+/g, '_');
    const sName = sanitizeS3KeyPart(name || 'User');
    const sUid = sanitizeS3KeyPart(uid);
    const nameUidKey = `${sName}_${sUid}`;

    // Build Firestore payload
    const updatePayload: any = {
      faceDescriptor: embedding512D || faceDescriptor || null,
      biometricVerified: true,
      biometricUpdatedAt: new Date().toISOString(),
      awsExternalImageId: nameUidKey
    };

    if (photoURL) {
      updatePayload.facePhotoURL = photoURL;
      updatePayload.facePhotoUrl = photoURL;
    }

    if (req.body.photoURL_center) {
      updatePayload.facePhotoURL_center = req.body.photoURL_center;
      updatePayload.facePhotoUrl_center = req.body.photoURL_center;
    }
    if (req.body.photoURL_left) {
      updatePayload.facePhotoURL_left = req.body.photoURL_left;
      updatePayload.facePhotoUrl_left = req.body.photoURL_left;
    }
    if (req.body.photoURL_right) {
      updatePayload.facePhotoURL_right = req.body.photoURL_right;
      updatePayload.facePhotoUrl_right = req.body.photoURL_right;
    }

    // 1. Update primary collection
    await db.collection(collectionName).doc(uid).set(updatePayload, { merge: true });

    // 2. Update central users collection
    try {
      await db.collection('users').doc(uid).set(updatePayload, { merge: true });
    } catch (usersErr: any) {
      console.log(`[ArcFace Biometrics] Users central doc update skip: ${usersErr.message}`);
    }

    // 3. Optional dynamic AWS Auto-Sync (if AWS config is set up)
    let awsSynced = false;
    let awsError = null;
    try {
      const schoolSettingsSnap = await db.collection('settings').doc('school').get();
      const schoolSettings = schoolSettingsSnap.exists ? schoolSettingsSnap.data() : null;
      const awsAccessKeyId = schoolSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
      const awsSecretAccessKey = schoolSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
      const awsRegionRaw = schoolSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
      const awsRegion = cleanAwsRegion(awsRegionRaw);
      const awsS3BucketName = schoolSettings?.awsS3BucketName || process.env.AWS_S3_BUCKET_NAME;

      if (awsAccessKeyId && awsSecretAccessKey && awsRegion && awsS3BucketName) {
        console.log(`[AWS Rekognition] AWS Config active. Auto-uploading registered photo(s) to S3 bucket '${awsS3BucketName}'...`);
        const s3Client = new S3Client({
          region: awsRegion,
          credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
        });
        const rekognition = new RekognitionClient({
          region: awsRegion,
          credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
        });

        await ensureCollectionExists(rekognition, "stantonys-staff-collection");

        // Prepare angles to upload and index
        const angles: { key: string; base64: string }[] = [];
        const centerPhoto = req.body.photoURL_center || photoURL || photoBase64;
        const leftPhoto = req.body.photoURL_left || (photosBase64 && photosBase64[1]) || null;
        const rightPhoto = req.body.photoURL_right || (photosBase64 && photosBase64[2]) || null;

        if (centerPhoto) {
          angles.push({ key: `${nameUidKey}_center.jpg`, base64: centerPhoto });
          angles.push({ key: `${nameUidKey}.jpg`, base64: centerPhoto });
        }
        if (leftPhoto) {
          angles.push({ key: `${nameUidKey}_left.jpg`, base64: leftPhoto });
        }
        if (rightPhoto) {
          angles.push({ key: `${nameUidKey}_right.jpg`, base64: rightPhoto });
        }

        for (const angle of angles) {
          await uploadToS3(s3Client, awsS3BucketName, angle.key, angle.base64);
          await indexFaceInRekognition(rekognition, awsS3BucketName, angle.key, nameUidKey);
        }
        console.log(`[AWS Rekognition] Auto-sync finished successfully for user: ${uid}`);
        awsSynced = true;
      }
    } catch (awsErr: any) {
      console.error(`[AWS Rekognition] Auto-sync failed for user ${uid}:`, awsErr.message || awsErr);
      awsError = awsErr.message || String(awsErr);
    }

    res.json({
      success: true,
      message: awsSynced
        ? 'Successfully registered face with high-accuracy AWS Rekognition S3 + Indexing'
        : storedInMicroservice 
          ? 'Successfully registered face with high-accuracy ArcFace (512-D)' 
          : 'Registered photo. Client-side high-accuracy faceapi.js backup mode activated.',
      highAccuracyActive: storedInMicroservice || awsSynced,
      awsSynced,
      awsError
    });

  } catch (error: any) {
    console.error('[ArcFace Biometrics] Register face photo error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Secure API Endpoint to delete registered Face ID (from S3, Rekognition, and Firestore)
router.post('/delete-face', async (req, res) => {
  try {
    const { uid, type } = req.body;
    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }

    const db = getDbAdmin();
    const collectionName = type === 'staff' ? 'staff' : 'students';

    // 1. Fetch the user's document to get their awsExternalImageId and name
    let userData: any = null;
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      userData = userDoc.exists ? userDoc.data() : null;
    } catch (err) {
      console.warn('[AWS Cleanup] Failed fetching users doc:', err);
    }

    if (!userData) {
      try {
        const specDoc = await db.collection(collectionName).doc(uid).get();
        userData = specDoc.exists ? specDoc.data() : null;
      } catch (err) {
        console.warn(`[AWS Cleanup] Failed fetching from ${collectionName}:`, err);
      }
    }

    const awsExternalImageId = userData?.awsExternalImageId || uid.replace(/[^a-zA-Z0-9_.\-:]/g, '_');
    const name = userData?.name || 'User';

    // 2. AWS Cleanup
    let awsCleaned = false;
    let awsError = null;
    try {
      const schoolSettingsSnap = await db.collection('settings').doc('school').get();
      const schoolSettings = schoolSettingsSnap.exists ? schoolSettingsSnap.data() : null;
      const awsAccessKeyId = schoolSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
      const awsSecretAccessKey = schoolSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
      const awsRegionRaw = schoolSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
      const awsRegion = cleanAwsRegion(awsRegionRaw);
      const awsS3BucketName = schoolSettings?.awsS3BucketName || process.env.AWS_S3_BUCKET_NAME;

      if (awsAccessKeyId && awsSecretAccessKey && awsRegion && awsS3BucketName) {
        console.log(`[AWS Cleanup] AWS Settings active. Deleting face ID for ${uid} (${name}) from S3 & Rekognition...`);
        const s3Client = new S3Client({
          region: awsRegion,
          credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
        });
        const rekognition = new RekognitionClient({
          region: awsRegion,
          credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
        });

        // A. Delete from S3
        const sanitizeS3KeyPart = (str: string) => str.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/_+/g, '_');
        const sName = sanitizeS3KeyPart(name);
        const sUid = sanitizeS3KeyPart(uid);
        const nameUidKey = `${sName}_${sUid}`;
        const safeUid = sUid;

        const keysToDelete = [
          `${nameUidKey}_center.jpg`,
          `${nameUidKey}.jpg`,
          `${nameUidKey}_left.jpg`,
          `${nameUidKey}_right.jpg`,
          `${safeUid}_center.jpg`,
          `${safeUid}.jpg`,
          `${safeUid}_left.jpg`,
          `${safeUid}_right.jpg`,
          `${uid}_center.jpg`,
          `${uid}.jpg`,
          `${uid}_left.jpg`,
          `${uid}_right.jpg`
        ];

        const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
        try {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: awsS3BucketName,
            Delete: {
              Objects: keysToDelete.map(k => ({ Key: k })),
              Quiet: true
            }
          }));
          console.log(`[AWS Cleanup] S3 deletion commands sent for keys:`, keysToDelete);
        } catch (s3Err: any) {
          console.warn(`[AWS Cleanup] S3 deletion partial fail/warning (expected if some keys do not exist):`, s3Err.message);
        }

        // B. Delete from Rekognition collection
        const { ListFacesCommand, DeleteFacesCommand } = await import("@aws-sdk/client-rekognition");
        try {
          const listRes = await rekognition.send(new ListFacesCommand({
            CollectionId: "stantonys-staff-collection",
            MaxResults: 100
          }));

          const faceIdsToDelete: string[] = [];
          if (listRes.Faces) {
            for (const face of listRes.Faces) {
              const extId = face.ExternalImageId;
              if (extId === awsExternalImageId || extId === safeUid || extId === uid || extId === nameUidKey) {
                if (face.FaceId) faceIdsToDelete.push(face.FaceId);
              }
            }
          }

          if (faceIdsToDelete.length > 0) {
            console.log(`[AWS Cleanup] Found ${faceIdsToDelete.length} matching face IDs in Rekognition collection. Deleting...`);
            await rekognition.send(new DeleteFacesCommand({
              CollectionId: "stantonys-staff-collection",
              FaceIds: faceIdsToDelete
            }));
          } else {
            console.log(`[AWS Cleanup] No matching indexed faces found in Rekognition collection for ${uid}`);
          }
        } catch (rekErr: any) {
          console.warn(`[AWS Cleanup] Rekognition deletion fail/warning:`, rekErr.message);
        }

        awsCleaned = true;
      }
    } catch (awsErr: any) {
      console.error(`[AWS Cleanup] AWS removal failed:`, awsErr);
      awsError = awsErr.message || String(awsErr);
    }

    // 3. Clear Firestore Biometric Fields
    const updatePayload: any = {
      faceDescriptor: null,
      biometricVerified: false,
      biometricUpdatedAt: null,
      awsExternalImageId: null,
      awsRekognitionMigrated: null,
      awsRekognitionMigratedAt: null,
      facePhotoURL: null,
      facePhotoUrl: null,
      facePhotoURL_center: null,
      facePhotoUrl_center: null,
      facePhotoURL_left: null,
      facePhotoUrl_left: null,
      facePhotoURL_right: null,
      facePhotoUrl_right: null
    };

    await db.collection(collectionName).doc(uid).set(updatePayload, { merge: true });
    try {
      await db.collection('users').doc(uid).set(updatePayload, { merge: true });
    } catch (err) {
      console.log(`[AWS Cleanup] Skip updating central users doc:`, err);
    }

    res.json({ success: true, awsCleaned, awsError });
  } catch (error: any) {
    console.error('[AWS Cleanup] Delete face ID fatal error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Secure API Endpoint to delete ALL registered Face IDs from Firestore and AWS (S3 & Rekognition)
router.post('/delete-all-faces', async (req, res) => {
  try {
    const db = getDbAdmin();
    console.log('[Delete All Faces] Starting bulk face cleanup...');

    // We will clear these fields
    const updatePayload: any = {
      faceDescriptor: null,
      biometricVerified: false,
      biometricUpdatedAt: null,
      awsExternalImageId: null,
      awsRekognitionMigrated: null,
      awsRekognitionMigratedAt: null,
      facePhotoURL: null,
      facePhotoUrl: null,
      facePhotoURL_center: null,
      facePhotoUrl_center: null,
      facePhotoURL_left: null,
      facePhotoUrl_left: null,
      facePhotoURL_right: null,
      facePhotoUrl_right: null
    };

    let cleanedCount = 0;

    // 1. Clean 'staff' collection
    const staffSnap = await db.collection('staff').get();
    const staffBatch = db.batch();
    let staffBatchCount = 0;
    for (const doc of staffSnap.docs) {
      const data = doc.data();
      if (data.biometricVerified || data.faceDescriptor || data.awsExternalImageId || data.facePhotoURL || data.facePhotoUrl) {
        staffBatch.set(doc.ref, updatePayload, { merge: true });
        staffBatchCount++;
        cleanedCount++;
        if (staffBatchCount >= 400) {
          await staffBatch.commit();
          staffBatchCount = 0;
        }
      }
    }
    if (staffBatchCount > 0) {
      await staffBatch.commit();
    }

    // 2. Clean 'students' collection
    const studentsSnap = await db.collection('students').get();
    const studentsBatch = db.batch();
    let studentsBatchCount = 0;
    for (const doc of studentsSnap.docs) {
      const data = doc.data();
      if (data.biometricVerified || data.faceDescriptor || data.awsExternalImageId || data.facePhotoURL || data.facePhotoUrl) {
        studentsBatch.set(doc.ref, updatePayload, { merge: true });
        studentsBatchCount++;
        cleanedCount++;
        if (studentsBatchCount >= 400) {
          await studentsBatch.commit();
          studentsBatchCount = 0;
        }
      }
    }
    if (studentsBatchCount > 0) {
      await studentsBatch.commit();
    }

    // 3. Clean 'users' collection
    const usersSnap = await db.collection('users').get();
    const usersBatch = db.batch();
    let usersBatchCount = 0;
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (data.biometricVerified || data.faceDescriptor || data.awsExternalImageId || data.facePhotoURL || data.facePhotoUrl) {
        usersBatch.set(doc.ref, updatePayload, { merge: true });
        usersBatchCount++;
        cleanedCount++;
        if (usersBatchCount >= 400) {
          await usersBatch.commit();
          usersBatchCount = 0;
        }
      }
    }
    if (usersBatchCount > 0) {
      await usersBatch.commit();
    }

    // Attempt to also clean Rekognition if credentials exist
    let awsCleaned = false;
    let awsError = null;
    try {
      const schoolSettingsSnap = await db.collection('settings').doc('school').get();
      const schoolSettings = schoolSettingsSnap.exists ? schoolSettingsSnap.data() : null;
      const awsAccessKeyId = schoolSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
      const awsSecretAccessKey = schoolSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
      const awsRegionRaw = schoolSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
      const awsRegion = cleanAwsRegion(awsRegionRaw);

      if (awsAccessKeyId && awsSecretAccessKey && awsRegion) {
        const rekognition = new RekognitionClient({
          region: awsRegion,
          credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
        });

        // Delete and recreate collection to delete all faces at once
        try {
          console.log('[Delete All Faces] Deleting Rekognition collection...');
          await rekognition.send(new DeleteCollectionCommand({ CollectionId: "stantonys-staff-collection" }));
          console.log('[Delete All Faces] Recreating empty Rekognition collection...');
          await rekognition.send(new CreateCollectionCommand({ CollectionId: "stantonys-staff-collection" }));
          awsCleaned = true;
        } catch (rekErr: any) {
          console.warn(`[Delete All Faces] Rekognition recreate warning:`, rekErr.message);
          awsError = rekErr.message;
        }
      }
    } catch (err: any) {
      console.warn('[Delete All Faces] AWS Rekognition collection recreate failed:', err);
      awsError = err.message || String(err);
    }

    console.log(`[Delete All Faces] Successfully cleaned up biometric fields for ${cleanedCount} records.`);
    res.json({ success: true, cleanedCount, awsCleaned, awsError });
  } catch (error: any) {
    console.error('[Delete All Faces] bulk face cleanup fatal error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Helper to check if student or staff has already marked attendance today
async function isAttendanceMarkedToday(db: any, uid: string, role: string, dateStr: string): Promise<boolean> {
  try {
    if (role === 'staff') {
      const snap = await db.collection('staff_attendance')
        .where('userId', '==', uid)
        .where('date', '==', dateStr)
        .limit(1)
        .get();
      if (!snap.empty) {
        const doc = snap.docs[0].data();
        return doc.status === 'present';
      }
    } else {
      // It's a student - check normal attendance
      const snapAtt = await db.collection('attendance')
        .where('studentId', '==', uid)
        .where('date', '==', dateStr)
        .limit(1)
        .get();
      if (!snapAtt.empty) {
        const doc = snapAtt.docs[0].data();
        if (doc.status === 'present') return true;
      }
      
      // Check school permissions / outpass
      const snapPerm = await db.collection('student_permissions')
        .where('studentId', '==', uid)
        .where('date', '==', dateStr)
        .limit(1)
        .get();
      if (!snapPerm.empty) return true;

      // Check hostel outings
      const snapHostel = await db.collection('hostel_outings')
        .where('studentId', '==', uid)
        .where('startDate', '==', dateStr)
        .limit(1)
        .get();
      if (!snapHostel.empty) return true;
    }
  } catch (err) {
    console.error("Error checking attendance status: ", err);
  }
  return false;
}

// Helper function to safely perform face comparison using AWS Rekognition with prioritized Center and Left/Right fallback
async function compareFaceForUser(
  rekognition: RekognitionClient,
  bucketName: string,
  uid: string,
  liveBuffer: Buffer,
  name?: string,
  awsExternalImageId?: string
): Promise<{ similarity: number } | null> {
  const sanitizeS3KeyPart = (str: string) => str.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/_+/g, '_');
  const safeUid = sanitizeS3KeyPart(uid);
  const safeName = sanitizeS3KeyPart(name || '');

  const prefixes = [];
  
  if (awsExternalImageId) {
    prefixes.push(awsExternalImageId);
    prefixes.push(sanitizeS3KeyPart(awsExternalImageId));
  }
  if (safeName && safeUid) {
    prefixes.push(`${safeName}_${safeUid}`);
  }
  if (name && uid) {
    prefixes.push(`${sanitizeS3KeyPart(name)}_${sanitizeS3KeyPart(uid)}`);
  }
  prefixes.push(safeUid);
  prefixes.push(uid);

  const uniquePrefixes = Array.from(new Set(prefixes));

  const primaryKeys: string[] = [];
  const fallbackKeys: string[] = [];

  uniquePrefixes.forEach(prefix => {
    primaryKeys.push(`${prefix}_center.jpg`);
    primaryKeys.push(`${prefix}.jpg`);
    primaryKeys.push(`${prefix}_center.png`);
    primaryKeys.push(`${prefix}_center.jpeg`);
    primaryKeys.push(`${prefix}.png`);
    primaryKeys.push(`${prefix}.jpeg`);
    primaryKeys.push(prefix);

    fallbackKeys.push(`${prefix}_left.jpg`);
    fallbackKeys.push(`${prefix}_left.png`);
    fallbackKeys.push(`${prefix}_left.jpeg`);
    fallbackKeys.push(`${prefix}_right.jpg`);
    fallbackKeys.push(`${prefix}_right.png`);
    fallbackKeys.push(`${prefix}_right.jpeg`);
  });

  const tryCompare = async (key: string): Promise<{ match: boolean; exists: boolean; similarity: number }> => {
    try {
      console.log(`[AWS Rekognition] Comparing live capture against key '${key}'...`);
      const command = new CompareFacesCommand({
        SourceImage: {
          S3Object: {
            Bucket: bucketName,
            Name: key
          }
        },
        TargetImage: {
          Bytes: liveBuffer
        },
        SimilarityThreshold: 0 // Fetch any similarity so we can log progress and find closest match
      });
      const response = await rekognition.send(command);
      
      const faceMatches = response.FaceMatches || [];
      if (faceMatches.length > 0) {
        const bestMatch = faceMatches[0];
        const similarity = bestMatch.Similarity || 0;
        console.log(`[AWS Rekognition] Face match found on key ${key} with similarity ${similarity.toFixed(2)}%`);
        return { match: similarity >= 95.0, exists: true, similarity };
      }
      return { match: false, exists: true, similarity: 0 };
    } catch (err: any) {
      const errCode = err.code || err.name || '';
      const errMsg = err.message || '';
      if (
        errCode.includes('NoSuchKey') || 
        errCode.includes('InvalidS3ObjectException') || 
        errCode.includes('NotFound') ||
        errCode.includes('AccessDenied')
      ) {
        // Safe info log to prevent false-alarm log parsers from flagging normal checks
        console.log(`[AWS Rekognition S3 Status] Key '${key}' is currently not registered or missing in S3.`);
        return { match: false, exists: false, similarity: 0 };
      }
      if (errCode.includes('InvalidParameterException') || errMsg.includes('no faces in the image')) {
        console.log(`[AWS Rekognition] Image for key '${key}' or live capture contains no detectable faces.`);
        return { match: false, exists: true, similarity: 0 };
      }
      console.log(`[AWS Rekognition S3 Warning] Key '${key}' status check returned: ${errCode}`);
      return { match: false, exists: false, similarity: 0 };
    }
  };

  // 1. First, try primary keys (Center / default)
  let bestPrimaryExists = false;
  let highestPrimarySimilarity = 0;

  for (const key of primaryKeys) {
    const res = await tryCompare(key);
    if (res.exists) {
      bestPrimaryExists = true;
      if (res.similarity > highestPrimarySimilarity) {
        highestPrimarySimilarity = res.similarity;
      }
      if (res.match) {
        console.log(`[AWS Rekognition] Strong match found on primary key ${key} (Similarity: ${res.similarity.toFixed(2)}%)`);
        return { similarity: res.similarity };
      }
    }
  }

  // 2. If primary comparison failed to meet 95.0% threshold, try fallback keys (Left and Right)
  let fallbackExists = false;
  if (bestPrimaryExists) {
    console.log(`[AWS Rekognition] Primary comparison for UID ${uid} did not meet 95.0% threshold (Best primary: ${highestPrimarySimilarity.toFixed(2)}%). Attempting fallback keys (Left/Right)...`);

    for (const key of fallbackKeys) {
      const res = await tryCompare(key);
      if (res.exists) {
        fallbackExists = true;
        if (res.match) {
          console.log(`[AWS Rekognition] Fallback match found on key ${key} (Similarity: ${res.similarity.toFixed(2)}%)`);
          return { similarity: res.similarity };
        }
      }
    }
  }

  if (!bestPrimaryExists && !fallbackExists) {
    console.log(`[AWS Rekognition] Candidate user ${uid} did not match primary or fallback S3 keys.`);
  }

  return null;
}

// Helper to compute Cosine Similarity of local face descriptors on the server side
function computeCosineSimilarityLocal(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length === 0 || v2.length === 0) return 0;
  const minLength = Math.min(v1.length, v2.length);
  let dotProductVal = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < minLength; i++) {
    dotProductVal += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProductVal / (Math.sqrt(normA) * Math.sqrt(normB));
}

// High-Accuracy AWS Rekognition Server-side Verify Photo Endpoint
router.post('/verify-face-photo', async (req, res) => {
  try {
    const { photoBase64, role, date, faceDescriptor } = req.body;

    if (!photoBase64) {
      return res.status(400).json({ error: 'Missing photoBase64 data' });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    const db = getDbAdmin();

    // 1. Load AWS Credentials dynamically from Firestore settings
    const schoolSettingsSnap = await db.collection('settings').doc('school').get();
    const schoolSettings = schoolSettingsSnap.exists ? schoolSettingsSnap.data() : null;

    const awsAccessKeyId = schoolSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = schoolSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegionRaw = schoolSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
    const awsRegion = cleanAwsRegion(awsRegionRaw);
    const awsS3BucketName = schoolSettings?.awsS3BucketName || process.env.AWS_S3_BUCKET_NAME;

    // 2. Validate AWS configurations
    if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion || !awsS3BucketName) {
      console.warn("[AWS Rekognition] AWS configurations are missing. Access ID, secret, region, or S3 bucket is incomplete.");
      return res.json({
        success: false,
        error: "AWS Rekognition credentials or S3 bucket name are not fully configured in School Settings. Please navigate to School Settings > AWS Config to enter details. / AWS ఆధారాలు సరిగా కాన్ఫిగర్ చేయబడలేదు. దయచేసి స్కూల్ సెట్టింగ్స్ లో పూరించండి."
      });
    }

    // 3. Lazy initialize Rekognition client
    const rekognition = new RekognitionClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    // 4. Convert Base64 webcam frame to Buffer for Bytes payload
    const liveBuffer = Buffer.from(photoBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');

    // 4.5. Fast Path: Use AWS Rekognition Collection Search first for sub-second high-accuracy identification!
    try {
      console.log(`[AWS Rekognition] Attempting fast collection search in 'stantonys-staff-collection'...`);
      const searchCommand = new SearchFacesByImageCommand({
        CollectionId: "stantonys-staff-collection",
        Image: {
          Bytes: liveBuffer
        },
        MaxFaces: 5,
        FaceMatchThreshold: 90.0
      });

      const searchResponse = await rekognition.send(searchCommand);
      const faceMatches = searchResponse.FaceMatches || [];
      console.log(`[AWS Rekognition] Collection search found ${faceMatches.length} matches.`);

      if (faceMatches.length > 0) {
        // Sort matches by similarity descending
        const sortedMatches = [...faceMatches].sort((a, b) => (b.Similarity || 0) - (a.Similarity || 0));
        const bestMatch = sortedMatches[0];
        
        // ExternalImageId is the uid of the matched user
        const matchedUid = bestMatch.Face?.ExternalImageId;
        const similarity = bestMatch.Similarity || 0;

        if (matchedUid && similarity >= 90.0) {
          console.log(`[AWS Rekognition Fast Path] Identified UID: ${matchedUid} with similarity: ${similarity.toFixed(2)}%`);
          
          // Extract possible UID from nameUidKey format: Name_UID
          let resolvedUid = matchedUid;
          if (matchedUid.includes('_')) {
            const parts = matchedUid.split('_');
            const possibleUid = parts[parts.length - 1]; // UID is the last part of Name_UID
            if (possibleUid && possibleUid.length >= 10) {
              resolvedUid = possibleUid;
            }
          }

          // Verify candidate exists in Firestore and has the appropriate role
          const collectionName = role === 'student' ? 'students' : 'staff';
          let userDoc = await db.collection(collectionName).doc(resolvedUid).get();
          if (!userDoc.exists) {
            userDoc = await db.collection(collectionName).doc(matchedUid).get();
          }
          if (!userDoc.exists) {
            const queryByUidSnap = await db.collection(collectionName).where('uid', '==', resolvedUid).limit(1).get();
            if (!queryByUidSnap.empty) {
              userDoc = queryByUidSnap.docs[0];
            }
          }
          if (!userDoc.exists) {
            const queryByUidSnap2 = await db.collection(collectionName).where('uid', '==', matchedUid).limit(1).get();
            if (!queryByUidSnap2.empty) {
              userDoc = queryByUidSnap2.docs[0];
            }
          }
          if (!userDoc.exists) {
            // Fallback: search by awsExternalImageId
            const usersQuerySnap = await db.collection(collectionName).where('awsExternalImageId', '==', matchedUid).limit(1).get();
            if (!usersQuerySnap.empty) {
              userDoc = usersQuerySnap.docs[0];
            }
          }

          if (userDoc.exists) {
            const resolvedUid = userDoc.id;
            const alreadyMarked = await isAttendanceMarkedToday(db, resolvedUid, role || 'student', targetDate);
            return res.json({
              success: true,
              identified: true,
              uid: resolvedUid,
              distance: 100 - similarity,
              similarity: similarity,
              alreadyMarked
            });
          }
        }
      }
    } catch (searchErr: any) {
      const searchErrMsg = searchErr.message || String(searchErr);
      if (searchErr.name === 'ResourceNotFoundException' || searchErrMsg.includes('not found')) {
        console.log("[AWS Rekognition Fast Path] Collection 'stantonys-staff-collection' not found. Creating collection...");
        ensureCollectionExists(rekognition, "stantonys-staff-collection").catch(e => console.error("[AWS Rekognition] Create collection error:", e));
      } else if (searchErr.name === 'InvalidParameterException' || searchErrMsg.includes('no faces in the image')) {
        console.log("[AWS Rekognition Fast Path] Live capture image frame does not contain a detectable face for AWS collection search.");
      } else {
        console.warn("[AWS Rekognition Fast Path] Collection search bypassed:", searchErrMsg);
      }
    }

    // 5. Query candidate list from Firestore based on the requested role
    const collectionName = role === 'student' ? 'students' : 'staff';
    const usersRef = db.collection(collectionName);

    const usersSnap = await usersRef.get();
    const candidates = usersSnap.docs.map(doc => {
      const data = doc.data() as any;
      const finalUid = data.uid || doc.id;
      return {
        ...data,
        id: doc.id,
        uid: finalUid
      } as any;
    });

    if (candidates.length === 0) {
      return res.json({
        success: true,
        identified: false,
        message: "No candidate users found for face identification."
      });
    }

    // Server-Side Pre-Filtering optimization using Cosine Similarity of Local faceDescriptor
    let filteredCandidates = candidates;
    let scoredCandidates: { user: any; similarity: number }[] = [];

    if (faceDescriptor && Array.isArray(faceDescriptor)) {
      const liveDesc = faceDescriptor.map(Number).filter((n: any) => !isNaN(n));
      if (liveDesc.length > 0) {
        console.log(`[AWS Rekognition Backend] Local face descriptor received. Pre-filtering ${candidates.length} candidates using local cosine similarity...`);
        
        scoredCandidates = candidates.map(user => {
          let bestSim = 0;
          if (user.faceDescriptor) {
            let userDesc: number[] = [];
            if (typeof user.faceDescriptor === 'string') {
              try {
                userDesc = JSON.parse(user.faceDescriptor);
              } catch (e) {
                userDesc = user.faceDescriptor.split(',').map(Number).filter((n: any) => !isNaN(n));
              }
            } else if (Array.isArray(user.faceDescriptor)) {
              userDesc = user.faceDescriptor.map(Number).filter((n: any) => !isNaN(n));
            } else if (typeof user.faceDescriptor === 'object') {
              const keys = Object.keys(user.faceDescriptor).map(Number).filter((n: any) => !isNaN(n));
              keys.sort((a, b) => a - b);
              userDesc = keys.map(k => Number((user.faceDescriptor as any)[k])).filter((n: any) => !isNaN(n));
            }
            
            if (userDesc.length > 0) {
              bestSim = computeCosineSimilarityLocal(liveDesc, userDesc);
            }
          }
          return { user, similarity: bestSim };
        });

        // Sort by local similarity descending
        scoredCandidates.sort((a, b) => b.similarity - a.similarity);
        
        console.log(`[AWS Rekognition Backend] Top local pre-filtered matches:`);
        scoredCandidates.slice(0, 5).forEach((c, idx) => {
          console.log(`  ${idx + 1}. UID: ${c.user.uid} (${(c.user as any).name || 'Unknown'}) - Local Similarity: ${c.similarity.toFixed(4)}`);
        });

        // Select top candidates for AWS verification to ensure highest accuracy.
        filteredCandidates = scoredCandidates.slice(0, 5).map(c => c.user);
        console.log(`[AWS Rekognition Backend] Selected top ${filteredCandidates.length} candidates for high-accuracy AWS CompareFaces verification.`);
      }
    }

    if (filteredCandidates.length > 5) {
      console.warn(`[AWS Rekognition Backend] Pre-filtering was bypassed or yielded too many candidates. Capping to top 5 candidates to prevent AWS rate limit issues.`);
      filteredCandidates = filteredCandidates.slice(0, 5);
    }

    // 6. Compare face against pre-filtered candidates to find a match (Similarity >= 95%)
    console.log(`[AWS Rekognition] Comparing live capture against ${filteredCandidates.length} pre-filtered candidates (out of ${candidates.length} total)...`);
    const results = await Promise.all(
      filteredCandidates.map(async (user) => {
        const matchResult = await compareFaceForUser(
          rekognition,
          awsS3BucketName,
          user.uid,
          liveBuffer,
          user.name || user.displayName,
          user.awsExternalImageId
        );
        if (matchResult) {
          return {
            uid: user.uid,
            similarity: matchResult.similarity
          };
        }
        return null;
      })
    );

    const activeMatches = results.filter((r): r is { uid: string; similarity: number } => r !== null);

    if (activeMatches.length > 0) {
      // Find the best match (highest similarity score)
      activeMatches.sort((a, b) => b.similarity - a.similarity);
      const bestMatch = activeMatches[0];
      
      console.log(`[AWS Rekognition] Successfully identified UID: ${bestMatch.uid} (Similarity: ${bestMatch.similarity.toFixed(2)}%)`);
      const alreadyMarked = await isAttendanceMarkedToday(db, bestMatch.uid, role || 'student', targetDate);

      return res.json({
        success: true,
        identified: true,
        uid: bestMatch.uid,
        distance: 100 - bestMatch.similarity, // Distance approximation
        similarity: bestMatch.similarity,
        alreadyMarked
      });
    }

    // Secondary Fallback: If AWS Rekognition did not match or face was not detected in AWS image, check if local faceDescriptor matches with high confidence and sufficient margin
    if (scoredCandidates && scoredCandidates.length > 0) {
      const bestLocal = scoredCandidates[0];
      const secondLocal = scoredCandidates.length > 1 ? scoredCandidates[1] : null;
      const margin = secondLocal ? (bestLocal.similarity - secondLocal.similarity) : 1.0;

      if (bestLocal && bestLocal.similarity >= 0.92 && margin >= 0.008 && bestLocal.user?.uid) {
        console.log(`[AWS Fallback] Matched via local face descriptor for UID: ${bestLocal.user.uid} (${(bestLocal.user as any).name || ''}) (Similarity: ${bestLocal.similarity.toFixed(4)}, Margin: ${margin.toFixed(4)})`);
        const alreadyMarked = await isAttendanceMarkedToday(db, bestLocal.user.uid, role || 'student', targetDate);
        return res.json({
          success: true,
          identified: true,
          uid: bestLocal.user.uid,
          distance: 100 - (bestLocal.similarity * 100),
          similarity: bestLocal.similarity * 100,
          alreadyMarked
        });
      } else if (bestLocal && bestLocal.similarity >= 0.92 && margin < 0.008) {
        console.warn(`[AWS Fallback Guard] Ambiguity detected on server fallback! Best candidate (${bestLocal.user?.name}) similarity is ${bestLocal.similarity.toFixed(4)}, but second candidate (${secondLocal?.user?.name}) similarity is ${secondLocal?.similarity.toFixed(4)} (Margin: ${margin.toFixed(4)} < 0.008). Rejecting false positive match.`);
      }
    }

    // No matched face found
    return res.json({
      success: true,
      identified: false,
      message: "No matching face recognized with 95% similarity or higher."
    });

  } catch (error: any) {
    console.error('[AWS Rekognition] Face verification exception:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Dedicated endpoint to check if a user is already marked today (for local/backup verification checks)
router.post('/check-marked-status', async (req, res) => {
  try {
    const { uid, role, date } = req.body;
    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }
    const db = getDbAdmin();
    const dateStr = date || new Date().toISOString().split('T')[0];
    const isMarked = await isAttendanceMarkedToday(db, uid, role || 'student', dateStr);
    res.json({ success: true, alreadyMarked: isMarked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Privileged Staff Attendance Marker Endpoint
router.post('/mark-staff-attendance', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json({ success: true, message: 'Staff attendance marked (fallback)' });
  }
  try {
    const { uid, status, date, method, existingRecordId } = req.body;

    if (!uid || !status || !date || !method) {
      return res.status(400).json({ error: 'Missing required attendance fields' });
    }

    const db = getDbAdmin();
    console.log(`[Backup Write] Marking staff attendance for '${uid}' as ${status} (${method}) on ${date}...`);

    if (existingRecordId) {
      await db.collection('staff_attendance').doc(existingRecordId).set({
        status,
        method,
        timestamp: new Date().toISOString()
      }, { merge: true });
    } else {
      // Avoid duplicate marking for same date if existingRecordId wasn't passed but exists
      const existingSnap = await db.collection('staff_attendance')
        .where('userId', '==', uid)
        .where('date', '==', date)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        await db.collection('staff_attendance').doc(existingSnap.docs[0].id).set({
          status,
          method,
          timestamp: new Date().toISOString()
        }, { merge: true });
      } else {
        await db.collection('staff_attendance').add({
          userId: uid,
          date,
          status,
          method,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({ success: true, message: 'Staff attendance marked successfully' });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, message: 'Staff attendance marked (fallback)' });
    }
    console.error('[Backup Write] Staff Attendance error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Privileged Student Permission Endpoint with Outpass & SMS WhatsApp Notification
router.post('/student-permission', async (req, res) => {
  try {
    const { studentId, date, type, reason, time, grantedBy, parentPhone, alertMessage } = req.body;

    if (!studentId || !date || !type || !reason || !time) {
      return res.status(400).json({ error: 'Missing required permission fields' });
    }

    const db = getDbAdmin();

    // Check if permission already exists for this student on this date
    const existingCheck = await db.collection('student_permissions')
      .where('studentId', '==', studentId)
      .where('date', '==', date)
      .get();

    if (!existingCheck.empty) {
      return res.status(400).json({ error: 'Already permission taken' });
    }

    console.log(`[Backup Write] Creating outpass permission for student '${studentId}'...`);

    // 1. Write the permission record
    const permDoc = await db.collection('student_permissions').add({
      type,
      reason,
      time,
      studentId,
      date,
      grantedBy: grantedBy || 'system',
      createdAt: new Date().toISOString()
    });

    // 2. Queue WhatsApp alert
    let waStatus = 'no_phone';
    const forceSend = req.body.forceSend === true;

    if (!parentPhone || parentPhone.trim() === '') {
      waStatus = 'missing_phone';
      safeLogWhatsappEvent('student_permission_missing_phone', {
        studentId,
        permissionId: permDoc.id,
        phone: ''
      });
    } else {
      const normalizedPhone = normalizeIndianPhone(parentPhone);
      const cleanedDigits = normalizedPhone.replace(/\D/g, '');
      const isValid = cleanedDigits.length === 12 && cleanedDigits.startsWith('91');

      if (!isValid) {
        waStatus = 'invalid_phone';
        safeLogWhatsappEvent('student_permission_invalid_phone', {
          studentId,
          permissionId: permDoc.id,
          phone: normalizedPhone.replace(/.(?=.{4})/g, '*')
        });
      } else {
        const schoolDoc = await db.collection('settings').doc('school').get();
        const resolvedSchoolId = schoolDoc.exists && schoolDoc.data()?.schoolId ? schoolDoc.data()?.schoolId : 'st_antonys_school';

        try {
          safeLogWhatsappEvent('permission_priority_p0_applied', {
            studentId,
            permissionId: permDoc.id
          });

          if (forceSend) {
            safeLogWhatsappEvent('student_permission_force_send_used', {
              studentId,
              permissionId: permDoc.id
            });
          }

          const result = await sendMessage(normalizedPhone, alertMessage || `Dear Parent, your ward has been marked for permission at ${time} on ${date}.`, {
            studentId,
            permissionId: permDoc.id,
            templateType: "student_permission",
            messageType: "permission_notice",
            eventType: "student_permission",
            priority: 0,
            source: "front_office_permission",
            date: date,
            schoolId: resolvedSchoolId,
            forceSend
          }, 'bot');

          if (result && result.skipped) {
            waStatus = 'duplicate_skipped';
            safeLogWhatsappEvent('student_permission_duplicate_skipped', {
              studentId,
              permissionId: permDoc.id,
              phone: normalizedPhone.replace(/.(?=.{4})/g, '*'),
              reason: result.reason || 'Idempotency Block'
            });
          } else {
            waStatus = 'queued';
            safeLogWhatsappEvent('student_permission_message_queued', {
              studentId,
              permissionId: permDoc.id,
              phone: normalizedPhone.replace(/.(?=.{4})/g, '*')
            });
          }
        } catch (err: any) {
          console.error('[Student Permission] Failed to queue/send WhatsApp message:', err.message);
          waStatus = 'failed';
        }
      }
    }

    res.json({ success: true, message: 'Outpass registered and alert processed successfully', docId: permDoc.id, waStatus });
  } catch (error: any) {
    console.error('[Backup Write] Student permission outpass error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/notify-absent', async (req, res) => {
  try {
    const { studentIds, date, classId, batchId } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No students specified' });
    }

    const db = getDbAdmin();
    
    // Resolve clean classId & batchId (default to 'all' if empty)
    const resolvedClassId = classId || 'all';
    const resolvedBatchId = batchId || 'all';
    const docId = `${date}_${resolvedClassId}_${resolvedBatchId}`;

    // Server-side block for duplicate sends on the same date for this specific batch/class
    const existSnap = await db.collection('attendance_alerts_sent').doc(docId).get();
    if (existSnap.exists) {
      return res.status(400).json({ error: 'already sent alerts' });
    }

    // Also block if global alert was sent for all classes of this date as fallback compatibility
    if (resolvedClassId === 'all' && resolvedBatchId === 'all') {
      const globalSnap = await db.collection('attendance_alerts_sent').doc(date).get();
      if (globalSnap.exists) {
        return res.status(400).json({ error: 'already sent alerts' });
      }
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Process students
    for (const studentId of studentIds) {
      try {
        let studentDoc = await db.collection('students').doc(studentId).get();
        if (!studentDoc.exists) {
          studentDoc = await db.collection('users').doc(studentId).get();
        }
        if (!studentDoc.exists) continue;
        
        const student = studentDoc.data();
        // Try to find parent WhatsApp or other contact numbers fallback cascadingly
        const parentPhone = student?.whatsappNumber || 
                            student?.parentPhone || 
                            student?.phone || 
                            student?.fatherPhone || 
                            student?.contact || 
                            student?.mobile || 
                            student?.emergencyContact || 
                            student?.motherPhone;
        
        if (!parentPhone) {
          results.failed++;
          results.errors.push(`No phone number found for ${student?.name}`);
          continue;
        }

        // Fetch template from Firestore
        const templateSnapshot = await db.collection('message_templates')
          .where('event', '==', 'absent')
          .where('isActive', '==', true)
          .limit(1)
          .get();

        const schoolDoc = await db.collection('settings').doc('school').get();
        const schoolName = schoolDoc.exists ? schoolDoc.data()?.schoolName : 'St. Antony’s School';
        const resolvedSchoolId = schoolDoc.exists && schoolDoc.data()?.schoolId ? schoolDoc.data()?.schoolId : 'st_antonys_school';

        let message = `*Attendance Alert - St. Antony's School* 🏫\n\nDear ${student?.fatherName || 'Parent'},\n\nThis is to inform you that *${student?.name}* (Roll No: ${student?.rollNumber || 'N/A'}) is marked *ABSENT* today (${date}).\n\nIf you have any queries, please contact the school office.\n\n_This is an automated message._`;

        if (!templateSnapshot.empty) {
          const template = templateSnapshot.docs[0].data();
          const templateContent = template.content;

          message = templateContent.replace(/\{\{(.*?)\}\}/g, (match: string, key: string) => {
            const k = key.trim();
            if (k === 'student_name') return student?.name || 'N/A';
            if (k === 'father_name') return student?.fatherName || 'Parent';
            if (k === 'date') return date || 'N/A';
            if (k === 'school_name') return schoolName;
            if (k === 'roll_number') return student?.rollNumber || 'N/A';
            return match;
          });
        }
        
        await sendMessage(parentPhone, message, {
          studentId: studentId,
          templateType: "absent",
          messageType: "attendance_absent",
          eventType: "absent",
          priority: 1,
          source: "attendance_notify_absent",
          date: date,
          schoolId: resolvedSchoolId,
          forceSend: false
        }, 'bot');
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Error for ${studentId}: ${err.message}`);
      }
    }

    if (results.success > 0) {
      await db.collection('attendance_alerts_sent').doc(docId).set({
        date,
        classId: resolvedClassId,
        batchId: resolvedBatchId,
        sentAt: new Date().toISOString(),
        count: results.success,
        studentIds: studentIds
      }, { merge: true });
    }

    res.json({ success: true, ...results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// Privileged Staff Attendance Getter Endpoint
router.get('/alerts-sent', async (req, res) => {
  try {
    const { date, classId, batchId } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Date parameter is required' });
    }
    const db = getDbAdmin();
    const resolvedClassId = classId || 'all';
    const resolvedBatchId = batchId || 'all';
    const docId = `${date}_${resolvedClassId}_${resolvedBatchId}`;

    const docSnap = await db.collection('attendance_alerts_sent').doc(docId).get();
    if (docSnap.exists) {
      res.json(docSnap.data());
    } else {
      // Fallback to check by date document for backwards compatibility if classId & batchId are both all
      if (resolvedClassId === 'all' && resolvedBatchId === 'all') {
        const legacySnap = await db.collection('attendance_alerts_sent').doc(date).get();
        if (legacySnap.exists) {
          return res.json(legacySnap.data());
        }
      }
      res.json(null);
    }
  } catch (error: any) {
    console.error('[Backup Read] Get attendance alerts sent error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Privileged Staff Attendance Getter Endpoint
router.get('/list-staff-attendance', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json([]);
  }
  try {
    const { date, status } = req.query;
    const db = getDbAdmin();
    let queryRef: any = db.collection('staff_attendance');
    
    if (date) {
      queryRef = queryRef.where('date', '==', date);
    }
    if (status) {
      queryRef = queryRef.where('status', '==', status);
    }
    
    const snapshot = await queryRef.get();
    const records = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(records);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json([]);
    }
    console.error('[Backup Read] List staff attendance error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Secure API Proxy for login_logs to bypass client side Firestore permission issues
router.get('/list-login-logs', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json([]);
  }
  try {
    const db = getDbAdmin();
    const snapshot = await db.collection('login_logs')
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();
      
    const records = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      uid: doc.id,
      ...doc.data()
    }));
    
    res.json(records);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json([]);
    }
    console.error('[Backup Read] List login logs error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Secure API Proxy for audit_logs to bypass client side Firestore permission issues
router.get('/list-audit-logs', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json([]);
  }
  try {
    const db = getDbAdmin();
    const snapshot = await db.collection('audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();
      
    const records = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      uid: doc.id,
      ...doc.data()
    }));
    
    res.json(records);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json([]);
    }
    console.error('[Backup Read] List audit logs error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Secure API Proxy to add login logs
router.post('/add-login-log', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json({ success: true, id: 'login_' + Date.now(), skipped: true });
  }
  try {
    const db = getDbAdmin();
    const logData = req.body;
    const docRef = await db.collection('login_logs').add({
      ...logData,
      createdAt: new Date().toISOString()
    });
    res.json({ success: true, id: docRef.id });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, id: 'login_' + Date.now(), skipped: true });
    }
    console.error('[Backup Write] Add login log error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Helper to sanitize and trim audit log data so it NEVER exceeds Firestore's 1MB limit
function sanitizeAuditLogPayload(data: any, depth = 0): any {
  if (depth > 6) return '[MAX_DEPTH]';
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    if (data.startsWith('data:') || data.length > 500) {
      return data.substring(0, 200) + `... [TRUNCATED ${data.length} chars]`;
    }
    return data;
  }
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    if (data.length > 25) {
      return data.slice(0, 25).map(v => sanitizeAuditLogPayload(v, depth + 1)).concat([`[... +${data.length - 25} more items]`]);
    }
    return data.map(v => sanitizeAuditLogPayload(v, depth + 1));
  }
  const sanitized: any = {};
  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('photo') ||
      lowerKey.includes('image') ||
      lowerKey.includes('avatar') ||
      lowerKey.includes('facedescriptor') ||
      lowerKey.includes('faceembedding') ||
      lowerKey.includes('filedata') ||
      lowerKey.includes('base64') ||
      lowerKey.includes('receipthtml') ||
      lowerKey.includes('signature') ||
      lowerKey.includes('attachment') ||
      lowerKey.includes('blob')
    ) {
      const val = data[key];
      if (typeof val === 'string' && val.length > 100) {
        sanitized[key] = `[TRUNCATED_MEDIA (${Math.round(val.length / 1024)} KB)]`;
        continue;
      }
    }
    sanitized[key] = sanitizeAuditLogPayload(data[key], depth + 1);
  }
  return sanitized;
}

// Secure API Proxy to add audit logs
router.post('/add-audit-log', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json({ success: true, id: 'audit_' + Date.now(), skipped: true });
  }
  try {
    const db = getDbAdmin();
    let logData = sanitizeAuditLogPayload(req.body);
    
    // Safety check: ensure stringified payload is well under 700 KB (Firestore max is 1MB)
    let serialized = JSON.stringify(logData);
    if (serialized.length > 600000) {
      logData = {
        action: logData.action || 'unknown',
        collectionName: logData.collectionName || 'unknown',
        docId: logData.docId || 'unknown',
        targetProfileName: logData.targetProfileName || 'Record',
        operator: logData.operator || {},
        timestamp: logData.timestamp || new Date().toISOString(),
        before: logData.before ? `[TRUNCATED_BEFORE_KEYS: ${Object.keys(logData.before || {}).slice(0, 20).join(', ')}]` : null,
        after: logData.after ? `[TRUNCATED_AFTER_KEYS: ${Object.keys(logData.after || {}).slice(0, 20).join(', ')}]` : null,
        note: 'Audit payload was pruned because total size exceeded safety threshold'
      };
    }

    const docRef = await db.collection('audit_logs').add({
      ...logData,
      createdAt: new Date().toISOString()
    });
    res.json({ success: true, id: docRef.id });
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, id: 'audit_' + Date.now(), skipped: true });
    }
    console.error('[Backup Write] Add audit log error:', error);
    // Graceful recovery: write minimal audit log to prevent losing audit event without crashing
    try {
      const db = getDbAdmin();
      const minimalDoc = {
        action: req.body?.action || 'unknown',
        collectionName: req.body?.collectionName || 'unknown',
        docId: req.body?.docId || 'unknown',
        targetProfileName: req.body?.targetProfileName || 'Record',
        operator: req.body?.operator || {},
        timestamp: req.body?.timestamp || new Date().toISOString(),
        note: 'Payload size exceeded Firestore 1MB limit; detailed diff was omitted.',
        createdAt: new Date().toISOString()
      };
      const fallbackRef = await db.collection('audit_logs').add(minimalDoc);
      return res.json({ success: true, id: fallbackRef.id, warning: 'Truncated audit log' });
    } catch (fallbackErr: any) {
      console.error('[Backup Write] Fallback audit log write failed:', fallbackErr?.message || fallbackErr);
      return res.status(200).json({ success: false, error: error.message });
    }
  }
});

// Utility to ensure AWS Rekognition collection exists
async function ensureCollectionExists(rekognition: RekognitionClient, collectionId: string) {
  try {
    await rekognition.send(new DescribeCollectionCommand({ CollectionId: collectionId }));
    console.log(`[AWS Rekognition] Collection '${collectionId}' already exists.`);
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException' || (err.message && err.message.includes('not found'))) {
      console.log(`[AWS Rekognition] Collection '${collectionId}' not found. Creating it...`);
      await rekognition.send(new CreateCollectionCommand({ CollectionId: collectionId }));
      console.log(`[AWS Rekognition] Collection '${collectionId}' successfully created.`);
    } else {
      console.error(`[AWS Rekognition] Error checking collection:`, err);
      throw err;
    }
  }
}

// Helper to get image Buffer from base64 data or web URL
async function getImageBuffer(photoField: string): Promise<Buffer> {
  if (photoField.startsWith('data:image/')) {
    const rawBase64 = photoField.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(rawBase64, 'base64');
  } else if (photoField.startsWith('http://') || photoField.startsWith('https://')) {
    console.log(`[AWS S3] Fetching image from public URL: ${photoField}`);
    const res = await fetch(photoField);
    if (!res.ok) {
      throw new Error(`Failed to fetch image from URL: ${photoField}. Status: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else {
    // Treat as raw base64 as fallback
    return Buffer.from(photoField, 'base64');
  }
}

// Utility to upload images to AWS S3 (handles base64 and public URLs automatically)
async function uploadToS3(s3: S3Client, bucket: string, key: string, base64OrUrl: string) {
  const buffer = await getImageBuffer(base64OrUrl);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg'
  });
  await s3.send(command);
}

// Utility to index a face in Rekognition
async function indexFaceInRekognition(rekognition: RekognitionClient, bucket: string, key: string, externalImageId: string) {
  const safeExternalImageId = externalImageId.replace(/[^a-zA-Z0-9_.\-:]/g, '_');
  console.log(`[AWS Rekognition] Indexing face for key ${key} and ExternalImageId ${safeExternalImageId}...`);
  const command = new IndexFacesCommand({
    CollectionId: "stantonys-staff-collection",
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: key
      }
    },
    ExternalImageId: safeExternalImageId,
    MaxFaces: 1,
    QualityFilter: "AUTO"
  });
  const result = await rekognition.send(command);
  return result;
}

// Privileged AWS Rekognition One-Time Migration Endpoint
router.post('/aws-rekognition-migration', async (req, res) => {
  try {
    const db = getDbAdmin();
    console.log("[AWS Migration] Checking if a migration is already running...");

    // Check if migration is already running to prevent double execution
    const statusRef = db.collection('settings').doc('aws_migration_status');
    const statusSnap = await statusRef.get();
    if (statusSnap.exists) {
      const statusData = statusSnap.data();
      if (statusData?.status === 'running') {
        const lastUpdated = statusData.lastUpdated ? new Date(statusData.lastUpdated).getTime() : 0;
        // If updated less than 10 minutes ago, treat as active to prevent double run
        if (Date.now() - lastUpdated < 10 * 60 * 1000) {
          return res.status(400).json({
            success: false,
            error: "Migration is already running. Please monitor the live console below. / మైగ్రేషన్ ఇప్పటికే నడుస్తోంది, దయచేసి కింద ఉన్న లైవ్ కన్సోల్‌ను చూడండి."
          });
        }
      }
    }

    console.log("[AWS Migration] Initializing AWS Rekognition One-Time Migration...");

    // 1. Load AWS credentials
    const schoolSettingsSnap = await db.collection('settings').doc('school').get();
    const schoolSettings = schoolSettingsSnap.exists ? schoolSettingsSnap.data() : null;

    const awsAccessKeyId = schoolSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = schoolSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegionRaw = schoolSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
    const awsRegion = cleanAwsRegion(awsRegionRaw);
    const awsS3BucketName = schoolSettings?.awsS3BucketName || process.env.AWS_S3_BUCKET_NAME;

    if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion || !awsS3BucketName) {
      return res.status(400).json({
        success: false,
        error: "AWS configurations are incomplete in School Settings. Please fill access key, secret key, region, and S3 bucket."
      });
    }

    // 2. Initialize clients
    const s3Client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    const rekognition = new RekognitionClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    // 3. Ensure Collection exists
    await ensureCollectionExists(rekognition, "stantonys-staff-collection");

    // 4. Fetch all biometric verified users
    const usersSnap = await db.collection('users').where('biometricVerified', '==', true).get();
    console.log(`[AWS Migration] Found ${usersSnap.size} biometric verified users in database.`);

    const totalCount = usersSnap.size;

    // Set initial running state
    await statusRef.set({
      status: 'running',
      progress: 0,
      total: totalCount,
      migrated: 0,
      failed: 0,
      logs: [
        `[${new Date().toLocaleTimeString()}] [SYSTEM] Starting AWS Rekognition One-Time Migration... / మైగ్రేషన్‌ను ప్రారంభిస్తున్నాము...`,
        `[${new Date().toLocaleTimeString()}] [SYSTEM] Found ${totalCount} biometric verified users to process. / ${totalCount} మంది ధృవీకరించబడిన వినియోగదారులను కనుగొన్నాము.`
      ],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    // Respond immediately to avoid browser timeout / Cloud Run gateway timeout!
    res.json({
      success: true,
      message: "Migration job successfully initiated in the background! / మైగ్రేషన్ విజయవంతంగా బ్యాక్‌గ్రౌండ్‌లో ప్రారంభించబడింది!",
      status: "started"
    });

    // Run the migration process asynchronously in the background
    let logs: string[] = [
      `[${new Date().toLocaleTimeString()}] [SYSTEM] Starting AWS Rekognition One-Time Migration... / మైగ్రేషన్‌ను ప్రారంభిస్తున్నాము...`,
      `[${new Date().toLocaleTimeString()}] [SYSTEM] Found ${totalCount} biometric verified users to process. / ${totalCount} మంది ధృవీకరించబడిన వినియోగదారులను కనుగొన్నాము.`
    ];

    (async () => {
      let migratedCount = 0;
      let failedCount = 0;
      let progressCount = 0;

      for (const doc of usersSnap.docs) {
        const uid = doc.id;
        const data = doc.data();
        const name = data.name || data.displayName || 'Unknown';
        progressCount++;

        const stepMsg = `[${new Date().toLocaleTimeString()}] (${progressCount}/${totalCount}) Processing user '${name}' (${uid})... / వినియోగదారు '${name}' మైగ్రేట్ అవుతున్నారు...`;
        console.log(`[AWS Migration Async] ${stepMsg}`);
        logs.push(stepMsg);

        // Update status in Firestore
        await statusRef.set({
          progress: progressCount,
          logs: logs,
          lastUpdated: new Date().toISOString()
        }, { merge: true });

        const centerPhoto = data.facePhotoURL_center || data.facePhotoUrl_center || data.facePhotoURL || data.facePhotoUrl || data.photoURL;
        const leftPhoto = data.facePhotoURL_left || data.facePhotoUrl_left || null;
        const rightPhoto = data.facePhotoURL_right || data.facePhotoUrl_right || null;

        if (!centerPhoto) {
          const skipMsg = `[${new Date().toLocaleTimeString()}] ⚠️ Skipped '${name}' (${uid}): No center or main face photo. / స్కిప్డ్: ముఖ చిత్రం లేదు.`;
          console.warn(`[AWS Migration Async] ${skipMsg}`);
          logs.push(skipMsg);
          await statusRef.set({ logs: logs, lastUpdated: new Date().toISOString() }, { merge: true });
          continue;
        }

        try {
          const sanitizeS3KeyPart = (str: string) => str.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/_+/g, '_');
          const sName = sanitizeS3KeyPart(name || 'User');
          const sUid = sanitizeS3KeyPart(uid);
          const nameUidKey = `${sName}_${sUid}`;
          const angles: { key: string; base64: string; label: string }[] = [];
          
          // Center photo
          angles.push({ key: `${nameUidKey}_center.jpg`, base64: centerPhoto, label: 'Center' });
          angles.push({ key: `${nameUidKey}.jpg`, base64: centerPhoto, label: 'Default' }); // standard key

          // Left photo
          if (leftPhoto) {
            angles.push({ key: `${nameUidKey}_left.jpg`, base64: leftPhoto, label: 'Left' });
          }

          // Right photo
          if (rightPhoto) {
            angles.push({ key: `${nameUidKey}_right.jpg`, base64: rightPhoto, label: 'Right' });
          }

          const uploadMsg = `[${new Date().toLocaleTimeString()}] 📤 Uploading ${angles.length} face angles to AWS S3 & Rekognition... / AWS S3 మరియు Rekognition కు ${angles.length} కోణాల ఫోటోలను అప్‌లోడ్ చేస్తున్నాము...`;
          logs.push(uploadMsg);
          await statusRef.set({ logs: logs, lastUpdated: new Date().toISOString() }, { merge: true });

          for (const angle of angles) {
            await uploadToS3(s3Client, awsS3BucketName, angle.key, angle.base64);
            await indexFaceInRekognition(rekognition, awsS3BucketName, angle.key, nameUidKey);
            const indexMsg = `[${new Date().toLocaleTimeString()}]   ✅ Indexed S3 key '${angle.key}' (${angle.label})`;
            logs.push(indexMsg);
            await statusRef.set({ logs: logs, lastUpdated: new Date().toISOString() }, { merge: true });
          }

          // Mark as migrated in main users collection and corresponding sub-collections
          const role = data.role === 'student' ? 'students' : 'staff';
          const migrationPayload = {
            awsRekognitionMigrated: true,
            awsRekognitionMigratedAt: new Date().toISOString(),
            awsExternalImageId: nameUidKey
          };
          await db.collection('users').doc(uid).set(migrationPayload, { merge: true });
          await db.collection(role).doc(uid).set(migrationPayload, { merge: true });

          migratedCount++;
          const successMsg = `[${new Date().toLocaleTimeString()}] 🎉 Successfully migrated ${name}! / '${name}' మైగ్రేషన్ విజయవంతమైంది!`;
          logs.push(successMsg);
          await statusRef.set({
            migrated: migratedCount,
            logs: logs,
            lastUpdated: new Date().toISOString()
          }, { merge: true });

        } catch (userErr: any) {
          failedCount++;
          const userErrMsg = `[${new Date().toLocaleTimeString()}] ❌ Failed migrating ${name}: ${userErr.message || userErr} / '${name}' మైగ్రేషన్ విఫలమైంది.`;
          console.error(`[AWS Migration Async] ${userErrMsg}`);
          logs.push(userErrMsg);
          await statusRef.set({
            failed: failedCount,
            logs: logs,
            lastUpdated: new Date().toISOString()
          }, { merge: true });
        }
      }

      // Final completed status
      const finishTime = new Date().toLocaleTimeString();
      const summaryMsg = `[${finishTime}] 🏁 Migration complete! Total: ${totalCount}, Migrated: ${migratedCount}, Failed: ${failedCount} / మైగ్రేషన్ పూర్తయింది! మొత్తం: ${totalCount}, విజయవంతమైనవి: ${migratedCount}, విఫలమైనవి: ${failedCount}`;
      console.log(`[AWS Migration Async] ${summaryMsg}`);
      logs.push(summaryMsg);

      await statusRef.set({
        status: 'completed',
        migrated: migratedCount,
        failed: failedCount,
        logs: logs,
        completedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }, { merge: true });

    })().catch(async (err: any) => {
      console.error('[AWS Migration Async] Fatal background thread error:', err);
      try {
        await statusRef.set({
          status: 'failed',
          logs: [...logs, `[${new Date().toLocaleTimeString()}] 🚨 Fatal background error: ${err.message || err}`],
          completedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.error('[AWS Migration Async] Failed recording fatal error to Firestore status:', e);
      }
    });

  } catch (error: any) {
    console.error('[AWS Migration] Migration handler initialization crash:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

export default router;

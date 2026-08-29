import { getDbAdmin, initializationPromise } from '../src/server/firebaseAdmin.js';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { RekognitionClient, CreateCollectionCommand, DescribeCollectionCommand, IndexFacesCommand } from "@aws-sdk/client-rekognition";
import 'dotenv/config';

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
async function indexFaceInRekognition(rekognition: RekognitionClient, bucket: string, key: string, uid: string) {
  console.log(`[AWS Rekognition] Indexing face for key ${key} and UID ${uid}...`);
  const command = new IndexFacesCommand({
    CollectionId: "stantonys-staff-collection",
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: key
      }
    },
    ExternalImageId: uid,
    MaxFaces: 1,
    QualityFilter: "AUTO"
  });
  const result = await rekognition.send(command);
  return result;
}

async function runMigration() {
  console.log("Waiting for Firebase Admin initialization...");
  await initializationPromise;
  const db = getDbAdmin();

  if (!db) {
    console.error("FAILED to initialize Firebase Admin. Please check your firebase-applet-config.json and project environment.");
    process.exit(1);
  }

  console.log("Initialized DB. Reading AWS Configurations from School Settings...");

  const schoolSettingsSnap = await db.collection('settings').doc('school').get();
  const schoolSettings = schoolSettingsSnap.exists ? schoolSettingsSnap.data() : null;

  const awsAccessKeyId = schoolSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = schoolSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
  const awsRegion = schoolSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
  const awsS3BucketName = schoolSettings?.awsS3BucketName || process.env.AWS_S3_BUCKET_NAME;

  if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion || !awsS3BucketName) {
    console.error("AWS configurations are incomplete in School Settings. Please enter AWS Details in the Settings UI.");
    process.exit(1);
  }

  console.log(`AWS Config loaded successfully. Region: ${awsRegion}, S3 Bucket: ${awsS3BucketName}`);

  // Initialize S3 and Rekognition
  const s3Client = new S3Client({
    region: awsRegion,
    credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
  });

  const rekognition = new RekognitionClient({
    region: awsRegion,
    credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
  });

  // Ensure 'stantonys-staff-collection' collection exists
  await ensureCollectionExists(rekognition, "stantonys-staff-collection");

  // Fetch biometric verified users
  console.log("Querying biometric-verified users from Firestore...");
  const usersSnap = await db.collection('users').where('biometricVerified', '==', true).get();
  console.log(`Found ${usersSnap.size} biometric-verified users to migrate.`);

  let successCount = 0;
  let failureCount = 0;

  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const data = doc.data();
    const name = data.name || data.displayName || 'Unknown';
    console.log(`\n--------------------------------------------`);
    console.log(`Migrating user: ${name} (UID: ${uid})`);

    const centerPhoto = data.facePhotoURL_center || data.facePhotoUrl_center || data.facePhotoURL || data.facePhotoUrl || data.photoURL;
    const leftPhoto = data.facePhotoURL_left || data.facePhotoUrl_left || null;
    const rightPhoto = data.facePhotoURL_right || data.facePhotoUrl_right || null;

    if (!centerPhoto) {
      console.warn(`[SKIP] No face photos found for ${name} (UID: ${uid}).`);
      continue;
    }

    try {
      const angles: { key: string; base64: string }[] = [];
      angles.push({ key: `${uid}_center.jpg`, base64: centerPhoto });
      angles.push({ key: `${uid}.jpg`, base64: centerPhoto }); // Primary / legacy compatibility

      if (leftPhoto) {
        angles.push({ key: `${uid}_left.jpg`, base64: leftPhoto });
      }
      if (rightPhoto) {
        angles.push({ key: `${uid}_right.jpg`, base64: rightPhoto });
      }

      console.log(`Uploading ${angles.length} poses to S3 and indexing in Rekognition...`);
      for (const angle of angles) {
        await uploadToS3(s3Client, awsS3BucketName, angle.key, angle.base64);
        await indexFaceInRekognition(rekognition, awsS3BucketName, angle.key, uid);
      }

      // Mark user as migrated
      const role = data.role === 'student' ? 'students' : 'staff';
      await db.collection('users').doc(uid).set({
        awsRekognitionMigrated: true,
        awsRekognitionMigratedAt: new Date().toISOString()
      }, { merge: true });

      await db.collection(role).doc(uid).set({
        awsRekognitionMigrated: true,
        awsRekognitionMigratedAt: new Date().toISOString()
      }, { merge: true });

      console.log(`[SUCCESS] User ${name} migrated successfully!`);
      successCount++;
    } catch (err: any) {
      console.error(`[FAILURE] Failed to migrate user ${name}:`, err.message || err);
      failureCount++;
    }
  }

  console.log(`\n============================================`);
  console.log(`Migration Complete!`);
  console.log(`Successfully Migrated: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  console.log(`============================================`);
}

runMigration().catch(err => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});

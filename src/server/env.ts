import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const isPlaceholder = (id?: string) => !id || id.includes('your-project-id') || id === 'project-id' || id.includes('ENTER_YOUR');

if (firebaseConfig.projectId && !isPlaceholder(firebaseConfig.projectId)) {
  process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
  process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
  console.log(`[Env] Set GOOGLE_CLOUD_PROJECT to ${firebaseConfig.projectId}`);
} else {
  console.log(`[Env] Using ambient project ID`);
}

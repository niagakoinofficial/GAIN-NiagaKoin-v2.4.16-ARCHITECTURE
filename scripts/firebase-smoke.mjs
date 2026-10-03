import 'dotenv/config';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

try {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || undefined });
  const auth = getAuth();
  const firestore = getFirestore();
  const [users, probe] = await Promise.all([
    auth.listUsers(1),
    firestore.collection('_gain_integration_probe').doc('read-only').get(),
  ]);
  console.log(JSON.stringify({
    ok: true,
    auth: { connected: true, sampleUserCount: users.users.length },
    firestore: { connected: true, probeExists: probe.exists },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error?.code || 'FIREBASE_SMOKE_FAILED', message: String(error?.message || error).slice(0, 500) }, null, 2));
  process.exit(1);
}

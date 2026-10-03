import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
// Firebase Web configuration is sourced exclusively from VITE_FIREBASE_*.
// Do not fall back to firebase-applet-config.json because that file belongs
// to a legacy Firebase project and can route Auth/Firestore to the wrong project.

export const activeFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

if (
  !activeFirebaseConfig.apiKey ||
  !activeFirebaseConfig.authDomain ||
  !activeFirebaseConfig.projectId ||
  !activeFirebaseConfig.storageBucket ||
  !activeFirebaseConfig.messagingSenderId ||
  !activeFirebaseConfig.appId
) {
  throw new Error(
    '[FIREBASE_CONFIG_INVALID] Missing required VITE_FIREBASE_* configuration.'
  );
}

const app = getApps().length > 0
  ? getApp()
  : initializeApp(activeFirebaseConfig);

// Empty value or "(default)" means Firestore's standard database.
const rawDbId = String(import.meta.env.VITE_FIREBASE_DATABASE_ID || '').trim();
const customDbId =
  rawDbId && rawDbId !== '(default)' ? rawDbId : undefined;

export const db = customDbId
  ? getFirestore(app, customDbId)
  : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (error?.code === 'auth/unauthorized-domain') {
      console.warn(
        '[Firebase Auth] Domain belum diizinkan di Firebase Console. Tambahkan domain aplikasi ke Authorized Domains di Authentication Settings.',
        error.message
      );
    } else if (
      error?.code !== 'auth/popup-closed-by-user' &&
      error?.code !== 'auth/cancelled-popup-request'
    ) {
      console.warn('[Firebase Auth] Sign-in notice:', error?.message || error);
    }
    throw error;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('[FIREBASE_SIGN_OUT_FAILED]', {
      code: typeof error?.code === 'string' ? error.code : 'auth/unknown',
    });
    throw error;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const firestoreError = error as { code?: string; message?: string };
  const safeMessage = String(firestoreError?.message || 'Unknown Firestore error')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .slice(0, 240);
  const safePath = path
    ?.replace(/(users\/)[^/]+/g, '$1[USER]')
    .replace(/(member_directory\/)[^/]+/g, '$1[MEMBER]') || null;
  const errInfo: FirestoreErrorInfo = {
    error: safeMessage,
    code: firestoreError?.code,
    operationType,
    path: safePath,
  };
  console.error('[FIRESTORE_ERROR]', errInfo);
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    console.error('[FIREBASE_CONNECTION_FAILED]', {
      code: typeof code === 'string' ? code : 'firestore/unknown',
    });
    throw error;
  }
}

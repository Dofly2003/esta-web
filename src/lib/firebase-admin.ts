import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Kredensial server:
 * - Emulator lokal: cukup FIRESTORE_EMULATOR_HOST & FIREBASE_AUTH_EMULATOR_HOST di .env
 * - Project asli (lokal/VPS): GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 * - Vercel dll.: FIREBASE_SERVICE_ACCOUNT berisi JSON service account (satu baris)
 * - Firebase App Hosting: otomatis, tidak perlu apa-apa
 */
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  return sa ? initializeApp({ credential: cert(JSON.parse(sa)), projectId }) : initializeApp({ projectId });
}

const g = globalThis as unknown as { __fs?: Firestore };

export function firestore() {
  if (!g.__fs) {
    g.__fs = getFirestore(app());
    g.__fs.settings({ ignoreUndefinedProperties: true });
  }
  return g.__fs;
}

export function adminAuth() {
  return getAuth(app());
}

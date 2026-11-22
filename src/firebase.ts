import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const HQ_EMAIL_DOMAIN = 'hq.durianvault.app';
export const ADMIN_AUTH_EMAIL = `admin@${HQ_EMAIL_DOMAIN}`;

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
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function usernameToAuthEmail(username: string): string {
  const clean = username.trim().toLowerCase();
  if (clean === 'admin' || clean === ADMIN_AUTH_EMAIL) {
    return ADMIN_AUTH_EMAIL;
  }
  return `${clean}@factory.durianvault.app`;
}

export function usernameToHqAuthEmail(username: string): string {
  const clean = username.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  return `${clean}@${HQ_EMAIL_DOMAIN}`;
}

async function provisionAuthUserByEmail(
  email: string,
  password: string,
  allowExistingSignIn = false
): Promise<string> {
  const secondaryName = `provisioner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    let uid = '';
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      uid = cred.user.uid;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : String(err);
      if (allowExistingSignIn && (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use'))) {
        const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
        uid = cred.user.uid;
      } else {
        throw err;
      }
    }
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

export async function provisionFactoryAuthUser(username: string, password: string): Promise<string> {
  return provisionAuthUserByEmail(usernameToAuthEmail(username), password, false);
}

export async function provisionHqAdminAuthUser(username: string, password: string): Promise<string> {
  return provisionAuthUserByEmail(usernameToHqAuthEmail(username), password, true);
}

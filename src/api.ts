import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import {
  ADMIN_AUTH_EMAIL,
  auth,
  db,
  handleFirestoreError,
  HQ_EMAIL_DOMAIN,
  OperationType,
  provisionFactoryAuthUser,
  provisionHqAdminAuthUser,
  usernameToAuthEmail,
  usernameToHqAuthEmail,
} from './firebase';
import type {
  ActivityEventType,
  ActivityLog,
  AdminOverviewData,
  AuthUser,
  Currency,
  Factory,
  FactoryPrice,
  FactoryWorkspaceData,
  Grade,
  InventoryItem,
  InventoryLog,
} from './types';

const BOOTSTRAP_ADMIN_EMAIL = 'xuxut58@gmail.com';
const recordedLoginsInMemory = new Set<string>();

function currentAdminActorUsername(): string {
  const email = auth.currentUser?.email || '';
  if (!email || email === BOOTSTRAP_ADMIN_EMAIL) return 'admin';
  return email.split('@')[0] || 'admin';
}

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function mapFactory(id: string, d: Record<string, unknown>): Factory {
  const ownerUid = typeof d.ownerUid === 'string' ? d.ownerUid : '';
  const authorizedEmail = typeof d.authorizedEmail === 'string' ? d.authorizedEmail : '';
  return {
    id,
    code: String(d.code ?? id),
    nameZh: String(d.nameZh ?? ''),
    nameEn: String(d.nameEn ?? ''),
    nameVi: String(d.nameVi ?? ''),
    region: String(d.region ?? 'VN'),
    location: String(d.location ?? ''),
    username: String(d.username ?? ''),
    ownerUid,
    authorizedEmail,
    hasPassword: ownerUid.length > 0,
    isActive: d.isActive !== false,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
}

function mapGrade(id: string, d: Record<string, unknown>): Grade {
  return {
    id,
    code: String(d.code ?? id),
    nameZh: String(d.nameZh ?? ''),
    nameEn: String(d.nameEn ?? ''),
    nameVi: String(d.nameVi ?? ''),
    specZh: String(d.specZh ?? ''),
    specEn: String(d.specEn ?? ''),
    specVi: String(d.specVi ?? ''),
    sortOrder: Number(d.sortOrder ?? 0),
    isActive: d.isActive !== false,
    updatedAt: tsToIso(d.updatedAt),
  };
}

function mapInventory(d: Record<string, unknown>): InventoryItem {
  return {
    factoryId: String(d.factoryId ?? ''),
    gradeId: String(d.gradeId ?? ''),
    factoryOwnerUid: String(d.factoryOwnerUid ?? ''),
    factoryAuthorizedEmail: String(d.factoryAuthorizedEmail ?? ''),
    quantityKg: Number(d.quantityKg ?? 0),
    note: String(d.note ?? ''),
    updatedAt: tsToIso(d.updatedAt),
    updatedBy: String(d.updatedBy ?? ''),
  };
}

function mapFactoryPrice(d: Record<string, unknown>): FactoryPrice {
  return {
    factoryId: String(d.factoryId ?? ''),
    gradeId: String(d.gradeId ?? ''),
    unitPrice: Number(d.unitPrice ?? 0),
    updatedAt: tsToIso(d.updatedAt),
  };
}

function mapLog(id: string, d: Record<string, unknown>): InventoryLog {
  const snapshotRaw = Array.isArray(d.snapshot) ? d.snapshot : [];
  return {
    id,
    factoryId: String(d.factoryId ?? ''),
    factoryCode: typeof d.factoryCode === 'string' ? d.factoryCode : undefined,
    factoryNameZh: typeof d.factoryNameZh === 'string' ? d.factoryNameZh : undefined,
    factoryNameEn: typeof d.factoryNameEn === 'string' ? d.factoryNameEn : undefined,
    factoryNameVi: typeof d.factoryNameVi === 'string' ? d.factoryNameVi : undefined,
    factoryOwnerUid: String(d.factoryOwnerUid ?? ''),
    factoryAuthorizedEmail: String(d.factoryAuthorizedEmail ?? ''),
    actorUsername: String(d.actorUsername ?? ''),
    actorRole: d.actorRole === 'admin' ? 'admin' : 'factory',
    totalKg: Number(d.totalKg ?? 0),
    snapshot: snapshotRaw.map((item) => ({
      code: String((item as Record<string, unknown>)?.code ?? ''),
      quantityKg: Number((item as Record<string, unknown>)?.quantityKg ?? 0),
    })),
    note: String(d.note ?? ''),
    createdAt: tsToIso(d.createdAt),
  };
}

function mapActivityLog(id: string, d: Record<string, unknown>): ActivityLog {
  const rawType = String(d.eventType ?? 'inventory_update');
  const eventType: ActivityEventType =
    rawType === 'login' || rawType === 'price_change' ? rawType : 'inventory_update';
  const rawCurrency = String(d.currency ?? '');
  const currency: Currency | '' =
    rawCurrency === 'CNY' || rawCurrency === 'USD' || rawCurrency === 'VND' ? rawCurrency : '';

  return {
    id,
    eventType,
    factoryId: String(d.factoryId ?? ''),
    factoryCode: String(d.factoryCode ?? ''),
    factoryNameZh: String(d.factoryNameZh ?? ''),
    factoryNameEn: String(d.factoryNameEn ?? ''),
    factoryNameVi: String(d.factoryNameVi ?? ''),
    factoryOwnerUid: String(d.factoryOwnerUid ?? ''),
    factoryAuthorizedEmail: String(d.factoryAuthorizedEmail ?? ''),
    actorUsername: String(d.actorUsername ?? ''),
    actorRole: d.actorRole === 'admin' ? 'admin' : 'factory',
    currency,
    totalKg: Number(d.totalKg ?? 0),
    details: String(d.details ?? ''),
    note: String(d.note ?? ''),
    createdAt: tsToIso(d.createdAt),
  };
}

function makeActivityPayload(params: {
  eventType: ActivityEventType;
  factory: Factory;
  actorUsername: string;
  actorRole: 'admin' | 'factory';
  currency?: Currency | '';
  totalKg?: number;
  details: string;
  note?: string;
}) {
  return {
    eventType: params.eventType,
    factoryId: params.factory.id,
    factoryCode: params.factory.code.slice(0, 32),
    factoryNameZh: (params.factory.nameZh || params.factory.code).slice(0, 100),
    factoryNameEn: (params.factory.nameEn || params.factory.nameZh || params.factory.code).slice(0, 100),
    factoryNameVi: (params.factory.nameVi || params.factory.nameEn || params.factory.nameZh || params.factory.code).slice(0, 100),
    factoryOwnerUid: params.factory.ownerUid,
    factoryAuthorizedEmail: params.factory.authorizedEmail,
    actorUsername: params.actorUsername.slice(0, 160),
    actorRole: params.actorRole,
    currency: params.currency ?? '',
    totalKg: Math.round(Math.max(0, params.totalKg ?? 0) * 100) / 100,
    details: params.details.slice(0, 500),
    note: (params.note ?? '').trim().slice(0, 300),
    createdAt: serverTimestamp(),
  };
}

async function commitBatchedSets(
  writes: { ref: DocumentReference; data: Record<string, unknown> }[]
): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const item of writes.slice(i, i + CHUNK_SIZE)) {
      batch.set(item.ref, item.data);
    }
    await batch.commit();
  }
}

async function recordFactoryLoginIfNeeded(fbUser: FirebaseUser, factory: Factory): Promise<void> {
  const sessionKey = `durian_login_${fbUser.uid}_${fbUser.metadata.lastSignInTime || 'active'}`;
  if (recordedLoginsInMemory.has(sessionKey)) return;
  try {
    if (window.sessionStorage.getItem(sessionKey) === '1') {
      recordedLoginsInMemory.add(sessionKey);
      return;
    }
  } catch {
    // Ignore storage restriction
  }

  recordedLoginsInMemory.add(sessionKey);
  try {
    window.sessionStorage.setItem(sessionKey, '1');
  } catch {
    // Ignore storage restriction
  }

  const logId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const actorUsername = factory.username || fbUser.email || fbUser.uid;
  try {
    await setDoc(
      doc(db, 'activityLogs', logId),
      makeActivityPayload({
        eventType: 'login',
        factory,
        actorUsername,
        actorRole: 'factory',
        details: `@${actorUsername}`,
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `activityLogs/${logId}`);
  }
}

async function seedInitialFirestoreIfEmpty(): Promise<void> {
  const gradesSnap = await getDocs(collection(db, 'grades'));
  const factoriesSnap = await getDocs(collection(db, 'factories'));

  const batch = writeBatch(db);
  let hasWrites = false;

  const settingsRef = doc(db, 'settings', 'global');
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists()) {
    batch.set(settingsRef, {
      currency: 'CNY',
      updatedAt: serverTimestamp(),
    });
    hasWrites = true;
  }

  const defaultGrades = [
    {
      id: 'A1',
      code: 'A1',
      nameZh: 'A级整瓣果肉 (金枕/Ri6)',
      nameEn: 'Grade A Whole Pulp (Monthong/Ri6)',
      nameVi: 'Cơm nguyên múi loại A (Monthong/Ri6)',
      specZh: '-18°C 液氮速冻 · 整瓣无核 · 真空1kg/袋',
      specEn: '-18°C IQF · Whole Seedless · 1kg Vacuum',
      specVi: 'Cấp đông -18°C · Nguyên múi tách hạt · Túi 1kg',
      sortOrder: 1,
    },
    {
      id: 'A2',
      code: 'A2',
      nameZh: '猫山王 D197 A级果肉',
      nameEn: 'Musang King D197 Grade A Pulp',
      nameVi: 'Cơm Musang King D197 loại A',
      specZh: '-35°C 液氮锁鲜 · 高干包 · 400g盒装',
      specEn: '-35°C Cryo-IQF · Creamy Grade A · 400g Tray',
      specVi: 'Cấp đông -35°C · Dẻo mịn loại A · Hộp 400g',
      sortOrder: 2,
    },
    {
      id: 'B1',
      code: 'B1',
      nameZh: 'B级碎瓣果肉',
      nameEn: 'Grade B Broken Pulp',
      nameVi: 'Cơm vỡ múi loại B',
      specZh: '完整度70%以上 · 甜品饮品原料 · 2kg/袋',
      specEn: '>70% intact · Beverage & Dessert Grade · 2kg',
      specVi: 'Độ nguyên >70% · Nguyên liệu pha chế · Túi 2kg',
      sortOrder: 3,
    },
    {
      id: 'C1',
      code: 'C1',
      nameZh: 'C级纯果泥 (无纤维)',
      nameEn: 'Grade C Seedless Puree',
      nameVi: 'Sầu riêng xay nhuyễn loại C',
      specZh: '精滤果泥 · Brix ≥ 28° · 5kg/袋',
      specEn: 'Fine Sieved Puree · Brix ≥ 28° · 5kg Bag',
      specVi: 'Xay mịn lọc xơ · Độ Brix ≥ 28° · Túi 5kg',
      sortOrder: 4,
    },
    {
      id: 'D1',
      code: 'D1',
      nameZh: '烘焙工业级果肉',
      nameEn: 'Industrial & Bakery Grade',
      nameVi: 'Cơm sầu riêng công nghiệp',
      specZh: '月饼/冰淇淋馅料专供 · 10kg/箱',
      specEn: 'Bakery & Ice Cream Filling · 10kg Carton',
      specVi: 'Nhân bánh & kem công nghiệp · Thùng 10kg',
      sortOrder: 5,
    },
  ];

  if (gradesSnap.empty) {
    for (const g of defaultGrades) {
      batch.set(doc(db, 'grades', g.id), {
        code: g.code,
        nameZh: g.nameZh,
        nameEn: g.nameEn,
        nameVi: g.nameVi,
        specZh: g.specZh,
        specEn: g.specEn,
        specVi: g.specVi,
        sortOrder: g.sortOrder,
        isActive: true,
        updatedAt: serverTimestamp(),
      });
    }
    hasWrites = true;
  }

  if (factoriesSnap.empty) {
    const defaultFactories = [
      { code: 'VN-TG-01', nameZh: '前江冷链一厂', nameEn: 'Tien Giang Cold Plant 01', nameVi: 'Nhà máy Tiền Giang 01', region: 'VN', location: 'Tiền Giang, Vietnam', username: 'vn_tg_01' },
      { code: 'VN-TG-02', nameZh: '前江冷链二厂', nameEn: 'Tien Giang Cold Plant 02', nameVi: 'Nhà máy Tiền Giang 02', region: 'VN', location: 'Cai Lậy, Tiền Giang', username: 'vn_tg_02' },
      { code: 'VN-DL-01', nameZh: '多乐高原加工厂', nameEn: 'Dak Lak Highland Plant', nameVi: 'Nhà máy Đắk Lắk 01', region: 'VN', location: 'Buôn Ma Thuột, Đắk Lắk', username: 'vn_dl_01' },
      { code: 'VN-DL-02', nameZh: '得农速冻工厂', nameEn: 'Dak Nong IQF Plant', nameVi: 'Nhà máy Đắk Nông 02', region: 'VN', location: 'Gia Nghĩa, Đắk Nông', username: 'vn_dl_02' },
      { code: 'VN-BT-01', nameZh: '槟椥果肉加工厂', nameEn: 'Ben Tre Pulp Factory', nameVi: 'Nhà máy Bến Tre 01', region: 'VN', location: 'Chợ Lách, Bến Tre', username: 'vn_bt_01' },
      { code: 'VN-CT-01', nameZh: '芹苴保税冷库厂', nameEn: 'Can Tho Cold Hub', nameVi: 'Kho lạnh Cần Thơ 01', region: 'VN', location: 'Cần Thơ, Vietnam', username: 'vn_ct_01' },
      { code: 'TH-CH-01', nameZh: '尖竹汶一厂', nameEn: 'Chanthaburi Plant 01', nameVi: 'Nhà máy Chanthaburi 01', region: 'TH', location: 'Chanthaburi, Thailand', username: 'th_ch_01' },
      { code: 'TH-CH-02', nameZh: '尖竹汶二厂', nameEn: 'Chanthaburi Plant 02', nameVi: 'Nhà máy Chanthaburi 02', region: 'TH', location: 'Tha Mai, Chanthaburi', username: 'th_ch_02' },
      { code: 'TH-CP-01', nameZh: '春蓬南部冷链厂', nameEn: 'Chumphon Southern Plant', nameVi: 'Nhà máy Chumphon 01', region: 'TH', location: 'Chumphon, Thailand', username: 'th_cp_01' },
      { code: 'TH-RY-01', nameZh: '罗勇液氮速冻厂', nameEn: 'Rayong Cryo Plant', nameVi: 'Nhà máy Rayong 01', region: 'TH', location: 'Rayong, Thailand', username: 'th_ry_01' },
      { code: 'MY-PH-01', nameZh: '彭亨劳勿猫山王厂', nameEn: 'Pahang Raub D197 Plant', nameVi: 'Nhà máy Pahang Raub 01', region: 'MY', location: 'Raub, Pahang, Malaysia', username: 'my_ph_01' },
      { code: 'MY-JH-01', nameZh: '柔佛永平加工厂', nameEn: 'Johor Yong Peng Plant', nameVi: 'Nhà máy Johor 01', region: 'MY', location: 'Yong Peng, Johor, Malaysia', username: 'my_jh_01' },
    ];

    const sampleStocks: Record<string, Record<string, number>> = {
      'VN-TG-01': { A1: 18500, A2: 1200, B1: 9400, C1: 6200, D1: 4800 },
      'VN-TG-02': { A1: 14200, A2: 800, B1: 7100, C1: 5500, D1: 3100 },
      'VN-DL-01': { A1: 22400, A2: 0, B1: 11800, C1: 8900, D1: 6400 },
      'VN-DL-02': { A1: 11600, A2: 0, B1: 6300, C1: 4200, D1: 2900 },
      'VN-BT-01': { A1: 9800, A2: 600, B1: 5400, C1: 3800, D1: 2100 },
      'VN-CT-01': { A1: 16300, A2: 1500, B1: 8200, C1: 4900, D1: 3600 },
      'TH-CH-01': { A1: 26800, A2: 900, B1: 13200, C1: 7600, D1: 5400 },
      'TH-CH-02': { A1: 19400, A2: 0, B1: 10500, C1: 6100, D1: 4200 },
      'TH-CP-01': { A1: 15100, A2: 400, B1: 7800, C1: 5300, D1: 3700 },
      'TH-RY-01': { A1: 12900, A2: 0, B1: 6900, C1: 4400, D1: 2800 },
      'MY-PH-01': { A1: 2400, A2: 14800, B1: 3600, C1: 5200, D1: 1800 },
      'MY-JH-01': { A1: 3100, A2: 9600, B1: 4100, C1: 3900, D1: 2200 },
    };

    for (const f of defaultFactories) {
      batch.set(doc(db, 'factories', f.code), {
        code: f.code,
        nameZh: f.nameZh,
        nameEn: f.nameEn,
        nameVi: f.nameVi,
        region: f.region,
        location: f.location,
        username: f.username,
        ownerUid: '',
        authorizedEmail: '',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const stockMap = sampleStocks[f.code] || {};
      for (const g of defaultGrades) {
        const qty = stockMap[g.code] ?? 0;
        batch.set(doc(db, 'inventory', `${f.code}_${g.id}`), {
          factoryId: f.code,
          gradeId: g.id,
          factoryOwnerUid: '',
          factoryAuthorizedEmail: '',
          quantityKg: qty,
          note: '',
          updatedAt: serverTimestamp(),
          updatedBy: 'initial_seed',
        });
      }
    }
    hasWrites = true;
  }

  if (hasWrites) {
    await batch.commit();
  }
}

export const api = {
  async checkSystemInitialized(): Promise<boolean> {
    try {
      const timeout = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3500);
      });
      const snap = await Promise.race([getDoc(doc(db, 'publicMeta', 'setup')), timeout]);
      if (!snap) return true;
      return snap.exists();
    } catch {
      return true;
    }
  },

  async setupMainAccount(password: string): Promise<void> {
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    let uid = '';
    try {
      const cred = await createUserWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
      uid = cred.user.uid;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('email-already-in-use')) {
        const cred = await signInWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
        uid = cred.user.uid;
      } else {
        throw err;
      }
    }

    try {
      const setupRef = doc(db, 'publicMeta', 'setup');
      const setupSnap = await getDoc(setupRef);
      if (!setupSnap.exists()) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'admins', uid), {
          email: ADMIN_AUTH_EMAIL,
          createdAt: serverTimestamp(),
        });
        batch.set(setupRef, {
          initialized: true,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      }
      await seedInitialFirestoreIfEmpty();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'publicMeta/setup');
    }
  },

  async loginWithCredentials(username: string, password: string): Promise<void> {
    const clean = username.trim().toLowerCase();
    if (!clean || !password) {
      throw new Error('Username and password are required');
    }
    if (clean.includes('@')) {
      await signInWithEmailAndPassword(auth, clean, password);
      return;
    }
    const primaryEmail = usernameToAuthEmail(clean);
    try {
      await signInWithEmailAndPassword(auth, primaryEmail, password);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const canFallbackToHq =
        clean !== 'admin' &&
        (code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found' ||
          code === 'auth/wrong-password');
      if (!canFallbackToHq) {
        throw err;
      }
      await signInWithEmailAndPassword(auth, usernameToHqAuthEmail(clean), password);
    }
  },

  async changeMainPassword(newPassword: string): Promise<void> {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Authentication required');
    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    await updatePassword(fbUser, newPassword);
  },

  async createHqAdmin(username: string, password: string): Promise<void> {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,64}$/.test(clean)) {
      throw new Error('Username must be 3-64 characters (a-z, 0-9, _, ., -)');
    }
    if (clean === 'admin') {
      throw new Error('Username "admin" is already reserved for the primary HQ account');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const email = usernameToHqAuthEmail(clean);
    const uid = await provisionHqAdminAuthUser(clean, password);
    try {
      await setDoc(doc(db, 'admins', uid), {
        email,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
    }
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },

  async resolveAuthenticatedUser(fbUser: FirebaseUser): Promise<AuthUser | null> {
    const email = fbUser.email || '';
    const isBootstrap = fbUser.emailVerified && email === BOOTSTRAP_ADMIN_EMAIL;

    let isListedAdmin = false;
    try {
      const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
      isListedAdmin = adminDoc.exists();
    } catch {
      isListedAdmin = false;
    }

    if (isBootstrap || isListedAdmin) {
      try {
        if (isBootstrap && !isListedAdmin) {
          await setDoc(doc(db, 'admins', fbUser.uid), {
            email,
            createdAt: serverTimestamp(),
          });
        }
        await seedInitialFirestoreIfEmpty();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'admins/seed');
      }

      const resolvedUsername = email.endsWith(`@${HQ_EMAIL_DOMAIN}`)
        ? email.slice(0, email.indexOf('@'))
        : email === BOOTSTRAP_ADMIN_EMAIL
        ? 'admin'
        : email.split('@')[0] || 'admin';

      return {
        uid: fbUser.uid,
        email,
        role: 'admin',
        username: resolvedUsername,
      };
    }

    try {
      const byUidSnap = await getDocs(
        query(collection(db, 'factories'), where('ownerUid', '==', fbUser.uid))
      );
      let factoryDoc = byUidSnap.docs[0];

      if (!factoryDoc && fbUser.emailVerified && email) {
        const byEmailSnap = await getDocs(
          query(collection(db, 'factories'), where('authorizedEmail', '==', email))
        );
        factoryDoc = byEmailSnap.docs[0];
      }

      if (!factoryDoc) {
        return null;
      }

      const factory = mapFactory(factoryDoc.id, factoryDoc.data());
      if (!factory.isActive) {
        throw new Error('Factory account is disabled');
      }

      await recordFactoryLoginIfNeeded(fbUser, factory);

      return {
        uid: fbUser.uid,
        email,
        role: 'factory',
        username: factory.username || email,
        factory,
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'Factory account is disabled') {
        throw err;
      }
      handleFirestoreError(err, OperationType.LIST, 'factories');
    }
  },

  // ---------------- FACTORY WORKSPACE ----------------

  async getFactoryWorkspace(factory: Factory): Promise<FactoryWorkspaceData> {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Authentication required');

    try {
      const factorySnap = await getDoc(doc(db, 'factories', factory.id));
      const latestFactory = factorySnap.exists()
        ? mapFactory(factorySnap.id, factorySnap.data())
        : factory;

      const gradesSnap = await getDocs(
        query(collection(db, 'grades'), where('isActive', '==', true))
      );
      const grades = gradesSnap.docs
        .map((d) => mapGrade(d.id, d.data()))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const useUidFilter = latestFactory.ownerUid && latestFactory.ownerUid === fbUser.uid;
      const invQuery = useUidFilter
        ? query(collection(db, 'inventory'), where('factoryOwnerUid', '==', fbUser.uid))
        : query(collection(db, 'inventory'), where('factoryAuthorizedEmail', '==', fbUser.email || ''));

      const invSnap = await getDocs(invQuery);
      const inventory = invSnap.docs
        .map((d) => mapInventory(d.data()))
        .filter((i) => i.factoryId === latestFactory.id);

      const logsQuery = useUidFilter
        ? query(collection(db, 'inventoryLogs'), where('factoryOwnerUid', '==', fbUser.uid))
        : query(collection(db, 'inventoryLogs'), where('factoryAuthorizedEmail', '==', fbUser.email || ''));

      const logsSnap = await getDocs(logsQuery);
      const logs = logsSnap.docs
        .map((d) => mapLog(d.id, d.data()))
        .filter((l) => l.factoryId === latestFactory.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20);

      return { factory: latestFactory, grades, inventory, logs };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `factories/${factory.id}`);
    }
  },

  async saveFactoryInventory(
    factory: Factory,
    grades: Grade[],
    items: { gradeId: string; quantityKg: number; note: string }[],
    generalNote: string
  ): Promise<{ inventory: InventoryItem[]; logs: InventoryLog[] }> {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Authentication required');

    const gradeMap = new Map(grades.map((g) => [g.id, g.code]));
    const actorName = factory.username || fbUser.email || fbUser.uid;

    try {
      const batch = writeBatch(db);
      let totalKg = 0;
      const snapshot: { code: string; quantityKg: number }[] = [];

      for (const item of items) {
        const qty = Math.round(Math.max(0, item.quantityKg) * 100) / 100;
        totalKg += qty;
        snapshot.push({
          code: gradeMap.get(item.gradeId) || item.gradeId,
          quantityKg: qty,
        });

        const invRef = doc(db, 'inventory', `${factory.id}_${item.gradeId}`);
        batch.set(invRef, {
          factoryId: factory.id,
          gradeId: item.gradeId,
          factoryOwnerUid: factory.ownerUid,
          factoryAuthorizedEmail: factory.authorizedEmail,
          quantityKg: qty,
          note: item.note.trim().slice(0, 200),
          updatedAt: serverTimestamp(),
          updatedBy: actorName.slice(0, 160),
        });
      }

      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      batch.set(doc(db, 'inventoryLogs', logId), {
        factoryId: factory.id,
        factoryCode: factory.code,
        factoryNameZh: factory.nameZh,
        factoryNameEn: factory.nameEn,
        factoryNameVi: factory.nameVi,
        factoryOwnerUid: factory.ownerUid,
        factoryAuthorizedEmail: factory.authorizedEmail,
        actorUsername: actorName.slice(0, 160),
        actorRole: 'factory',
        totalKg: Math.round(totalKg * 100) / 100,
        snapshot,
        note: generalNote.trim().slice(0, 300),
        createdAt: serverTimestamp(),
      });

      const actId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const details = snapshot.map((s) => `${s.code}: ${s.quantityKg}`).join(' · ');
      batch.set(
        doc(db, 'activityLogs', actId),
        makeActivityPayload({
          eventType: 'inventory_update',
          factory,
          actorUsername: actorName,
          actorRole: 'factory',
          totalKg,
          details,
          note: generalNote,
        })
      );

      await batch.commit();
      const ws = await this.getFactoryWorkspace(factory);
      return { inventory: ws.inventory, logs: ws.logs };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `inventory/${factory.id}`);
    }
  },

  // ---------------- ADMIN WORKSPACE ----------------

  async getAdminOverview(): Promise<AdminOverviewData> {
    try {
      const [settingsSnap, factoriesSnap, gradesSnap, invSnap, pricesSnap, logsSnap, activitySnap] =
        await Promise.all([
          getDoc(doc(db, 'settings', 'global')),
          getDocs(collection(db, 'factories')),
          getDocs(collection(db, 'grades')),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'factoryPrices')),
          getDocs(collection(db, 'inventoryLogs')),
          getDocs(collection(db, 'activityLogs')),
        ]);

      const rawCurr = settingsSnap.exists() ? settingsSnap.data().currency : 'CNY';
      const currency: Currency =
        rawCurr === 'USD' || rawCurr === 'VND' ? rawCurr : 'CNY';

      const factories = factoriesSnap.docs
        .map((d) => mapFactory(d.id, d.data()))
        .sort((a, b) => a.code.localeCompare(b.code));

      const grades = gradesSnap.docs
        .map((d) => mapGrade(d.id, d.data()))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const inventory = invSnap.docs.map((d) => mapInventory(d.data()));
      const factoryPrices = pricesSnap.docs.map((d) => mapFactoryPrice(d.data()));
      const recentLogs = logsSnap.docs
        .map((d) => mapLog(d.id, d.data()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30);

      const activityLogs = activitySnap.docs
        .map((d) => mapActivityLog(d.id, d.data()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200);

      return {
        currency,
        factories,
        grades,
        inventory,
        factoryPrices,
        recentLogs,
        activityLogs,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'admin/overview');
    }
  },

  async updateFactoryPrices(
    currency: Currency,
    prices: { factoryId: string; gradeId: string; unitPrice: number }[],
    auditContext?: {
      factories: Factory[];
      grades: Grade[];
      previousPrices: FactoryPrice[];
      previousCurrency: Currency;
    }
  ): Promise<{ currency: Currency; factoryPrices: FactoryPrice[] }> {
    try {
      const writes: { ref: DocumentReference; data: Record<string, unknown> }[] = [
        {
          ref: doc(db, 'settings', 'global'),
          data: {
            currency,
            updatedAt: serverTimestamp(),
          },
        },
      ];

      for (const p of prices) {
        const unitPrice = Math.round(Math.max(0, p.unitPrice) * 100) / 100;
        writes.push({
          ref: doc(db, 'factoryPrices', `${p.factoryId}_${p.gradeId}`),
          data: {
            factoryId: p.factoryId,
            gradeId: p.gradeId,
            unitPrice,
            updatedAt: serverTimestamp(),
          },
        });
      }

      if (auditContext) {
        const factoryMap = new Map(auditContext.factories.map((f) => [f.id, f]));
        const gradeMap = new Map(auditContext.grades.map((g) => [g.id, g.code]));
        const prevMap = new Map(
          auditContext.previousPrices.map((p) => [`${p.factoryId}_${p.gradeId}`, p.unitPrice])
        );

        const changesByFactory = new Map<string, string[]>();
        for (const p of prices) {
          const nextPrice = Math.round(Math.max(0, p.unitPrice) * 100) / 100;
          const prevPrice = prevMap.get(`${p.factoryId}_${p.gradeId}`) ?? 0;
          if (nextPrice !== prevPrice) {
            const gCode = gradeMap.get(p.gradeId) || p.gradeId;
            const list = changesByFactory.get(p.factoryId) ?? [];
            list.push(`${gCode}: ${prevPrice} -> ${nextPrice}`);
            changesByFactory.set(p.factoryId, list);
          }
        }

        const currencyChanged = auditContext.previousCurrency !== currency;
        if (currencyChanged && changesByFactory.size === 0) {
          const pricedFactoryIds = new Set(
            prices.filter((p) => p.unitPrice > 0).map((p) => p.factoryId)
          );
          for (const fid of pricedFactoryIds) {
            changesByFactory.set(fid, [`${auditContext.previousCurrency} -> ${currency}`]);
          }
        }

        let seq = 0;
        const actorName = currentAdminActorUsername();
        for (const [factoryId, diffs] of changesByFactory.entries()) {
          const factory = factoryMap.get(factoryId);
          if (!factory) continue;
          const actId = `act_${Date.now()}_${seq++}_${Math.random().toString(36).slice(2, 6)}`;
          const details = `${currency} · ${diffs.join(' · ')}`;
          writes.push({
            ref: doc(db, 'activityLogs', actId),
            data: makeActivityPayload({
              eventType: 'price_change',
              factory,
              actorUsername: actorName,
              actorRole: 'admin',
              currency,
              details,
            }),
          });
        }
      }

      await commitBatchedSets(writes);
      const pricesSnap = await getDocs(collection(db, 'factoryPrices'));
      return {
        currency,
        factoryPrices: pricesSnap.docs.map((d) => mapFactoryPrice(d.data())),
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'factoryPrices');
    }
  },

  async createFactory(payload: {
    code: string;
    nameZh: string;
    nameEn: string;
    nameVi: string;
    region: string;
    location: string;
    username: string;
    password: string;
  }): Promise<void> {
    const cleanCode = payload.code.trim().toUpperCase().replace(/[^A-Za-z0-9_-]/g, '');
    const cleanUsername = payload.username.trim().toLowerCase();

    if (!cleanCode) throw new Error('Valid factory code is required (letters, digits, -, _)');
    if (cleanUsername === 'admin') {
      throw new Error('Username "admin" is reserved for headquarters');
    }
    if (!/^[a-z0-9_.-]{3,64}$/.test(cleanUsername)) {
      throw new Error('Username must be 3-64 characters (a-z, 0-9, _, ., -)');
    }

    const existingRef = doc(db, 'factories', cleanCode);
    const existingSnap = await getDoc(existingRef);
    if (existingSnap.exists()) {
      throw new Error('Factory code already exists');
    }

    let ownerUid = '';
    if (payload.password.length > 0) {
      if (payload.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      ownerUid = await provisionFactoryAuthUser(cleanUsername, payload.password);
    }

    try {
      await setDoc(existingRef, {
        code: cleanCode,
        nameZh: payload.nameZh.trim().slice(0, 100),
        nameEn: (payload.nameEn || payload.nameZh).trim().slice(0, 100),
        nameVi: (payload.nameVi || payload.nameEn || payload.nameZh).trim().slice(0, 100),
        region: payload.region,
        location: payload.location.trim().slice(0, 120),
        username: cleanUsername,
        ownerUid,
        authorizedEmail: '',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `factories/${cleanCode}`);
    }
  },

  async updateFactory(
    factory: Factory,
    payload: {
      nameZh: string;
      nameEn: string;
      nameVi: string;
      region: string;
      location: string;
      username: string;
      password: string;
      isActive: boolean;
    }
  ): Promise<void> {
    const cleanUsername = payload.username.trim().toLowerCase();
    if (cleanUsername === 'admin') {
      throw new Error('Username "admin" is reserved for headquarters');
    }
    if (!/^[a-z0-9_.-]{3,64}$/.test(cleanUsername)) {
      throw new Error('Username must be 3-64 characters (a-z, 0-9, _, ., -)');
    }

    let ownerUid = factory.ownerUid;
    if (payload.password.length > 0) {
      if (payload.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      ownerUid = await provisionFactoryAuthUser(cleanUsername, payload.password);
    }

    try {
      const factoryRef = doc(db, 'factories', factory.id);
      const existingSnap = await getDoc(factoryRef);
      if (!existingSnap.exists()) throw new Error('Factory not found');
      const createdAt = existingSnap.data().createdAt;

      const batch = writeBatch(db);
      batch.set(factoryRef, {
        code: factory.code,
        nameZh: payload.nameZh.trim().slice(0, 100),
        nameEn: (payload.nameEn || payload.nameZh).trim().slice(0, 100),
        nameVi: (payload.nameVi || payload.nameEn || payload.nameZh).trim().slice(0, 100),
        region: payload.region,
        location: payload.location.trim().slice(0, 120),
        username: cleanUsername,
        ownerUid,
        authorizedEmail: '',
        isActive: payload.isActive,
        createdAt,
        updatedAt: serverTimestamp(),
      });

      if (ownerUid !== factory.ownerUid || factory.authorizedEmail !== '') {
        const [invSnap, logsSnap] = await Promise.all([
          getDocs(query(collection(db, 'inventory'), where('factoryId', '==', factory.id))),
          getDocs(query(collection(db, 'inventoryLogs'), where('factoryId', '==', factory.id))),
        ]);
        for (const d of invSnap.docs) {
          batch.update(d.ref, {
            factoryOwnerUid: ownerUid,
            factoryAuthorizedEmail: '',
            updatedAt: serverTimestamp(),
          });
        }
        for (const d of logsSnap.docs) {
          batch.update(d.ref, {
            factoryOwnerUid: ownerUid,
            factoryAuthorizedEmail: '',
          });
        }
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `factories/${factory.id}`);
    }
  },

  async deleteFactory(factoryId: string): Promise<void> {
    try {
      const [invSnap, pricesSnap] = await Promise.all([
        getDocs(query(collection(db, 'inventory'), where('factoryId', '==', factoryId))),
        getDocs(query(collection(db, 'factoryPrices'), where('factoryId', '==', factoryId))),
      ]);
      const batch = writeBatch(db);
      for (const d of invSnap.docs) batch.delete(d.ref);
      for (const d of pricesSnap.docs) batch.delete(d.ref);
      batch.delete(doc(db, 'factories', factoryId));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `factories/${factoryId}`);
    }
  },

  async adminUpdateFactoryInventory(
    factory: Factory,
    grades: Grade[],
    items: { gradeId: string; quantityKg: number; note: string }[],
    generalNote: string
  ): Promise<void> {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Authentication required');

    const gradeMap = new Map(grades.map((g) => [g.id, g.code]));
    const actorName = currentAdminActorUsername();

    try {
      const batch = writeBatch(db);
      let totalKg = 0;
      const snapshot: { code: string; quantityKg: number }[] = [];

      for (const item of items) {
        const qty = Math.round(Math.max(0, item.quantityKg) * 100) / 100;
        totalKg += qty;
        snapshot.push({
          code: gradeMap.get(item.gradeId) || item.gradeId,
          quantityKg: qty,
        });

        batch.set(doc(db, 'inventory', `${factory.id}_${item.gradeId}`), {
          factoryId: factory.id,
          gradeId: item.gradeId,
          factoryOwnerUid: factory.ownerUid,
          factoryAuthorizedEmail: factory.authorizedEmail,
          quantityKg: qty,
          note: item.note.trim().slice(0, 200),
          updatedAt: serverTimestamp(),
          updatedBy: actorName.slice(0, 160),
        });
      }

      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      batch.set(doc(db, 'inventoryLogs', logId), {
        factoryId: factory.id,
        factoryCode: factory.code,
        factoryNameZh: factory.nameZh,
        factoryNameEn: factory.nameEn,
        factoryNameVi: factory.nameVi,
        factoryOwnerUid: factory.ownerUid,
        factoryAuthorizedEmail: factory.authorizedEmail,
        actorUsername: actorName.slice(0, 160),
        actorRole: 'admin',
        totalKg: Math.round(totalKg * 100) / 100,
        snapshot,
        note: generalNote.trim().slice(0, 300),
        createdAt: serverTimestamp(),
      });

      const actId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const details = snapshot.map((s) => `${s.code}: ${s.quantityKg}`).join(' · ');
      batch.set(
        doc(db, 'activityLogs', actId),
        makeActivityPayload({
          eventType: 'inventory_update',
          factory,
          actorUsername: actorName,
          actorRole: 'admin',
          totalKg,
          details,
          note: generalNote,
        })
      );

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `inventory/${factory.id}`);
    }
  },

  async createGrade(payload: {
    code: string;
    nameZh: string;
    nameEn: string;
    nameVi: string;
    specZh: string;
    specEn: string;
    specVi: string;
    sortOrder: number;
  }): Promise<void> {
    const cleanCode = payload.code.trim().toUpperCase().replace(/[^A-Za-z0-9_-]/g, '');
    if (!cleanCode) throw new Error('Valid grade code is required');

    const gradeRef = doc(db, 'grades', cleanCode);
    const snap = await getDoc(gradeRef);
    if (snap.exists()) throw new Error('Grade code already exists');

    try {
      await setDoc(gradeRef, {
        code: cleanCode,
        nameZh: payload.nameZh.trim().slice(0, 100),
        nameEn: (payload.nameEn || payload.nameZh).trim().slice(0, 100),
        nameVi: (payload.nameVi || payload.nameEn || payload.nameZh).trim().slice(0, 100),
        specZh: payload.specZh.trim().slice(0, 160),
        specEn: (payload.specEn || payload.specZh).trim().slice(0, 160),
        specVi: (payload.specVi || payload.specEn || payload.specZh).trim().slice(0, 160),
        sortOrder: payload.sortOrder,
        isActive: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `grades/${cleanCode}`);
    }
  },

  async updateGrade(
    grade: Grade,
    payload: {
      nameZh: string;
      nameEn: string;
      nameVi: string;
      specZh: string;
      specEn: string;
      specVi: string;
      isActive: boolean;
    }
  ): Promise<void> {
    try {
      await updateDoc(doc(db, 'grades', grade.id), {
        nameZh: payload.nameZh.trim().slice(0, 100),
        nameEn: (payload.nameEn || payload.nameZh).trim().slice(0, 100),
        nameVi: (payload.nameVi || payload.nameEn || payload.nameZh).trim().slice(0, 100),
        specZh: payload.specZh.trim().slice(0, 160),
        specEn: (payload.specEn || payload.specZh).trim().slice(0, 160),
        specVi: (payload.specVi || payload.specEn || payload.specZh).trim().slice(0, 160),
        isActive: payload.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `grades/${grade.id}`);
    }
  },
};

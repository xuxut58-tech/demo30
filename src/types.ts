export type Lang = 'zh' | 'en' | 'vi';
export type Currency = 'CNY' | 'USD' | 'VND';
export type ActivityEventType = 'login' | 'inventory_update' | 'price_change';

export interface Factory {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  nameVi: string;
  region: string;
  location: string;
  username: string;
  ownerUid: string;
  authorizedEmail: string;
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Grade {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  nameVi: string;
  specZh: string;
  specEn: string;
  specVi: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export interface InventoryItem {
  factoryId: string;
  gradeId: string;
  factoryOwnerUid: string;
  factoryAuthorizedEmail: string;
  quantityKg: number;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FactoryPrice {
  factoryId: string;
  gradeId: string;
  unitPrice: number;
  updatedAt: string;
}

export interface InventoryLog {
  id: string;
  factoryId: string;
  factoryCode?: string;
  factoryNameZh?: string;
  factoryNameEn?: string;
  factoryNameVi?: string;
  factoryOwnerUid: string;
  factoryAuthorizedEmail: string;
  actorUsername: string;
  actorRole: 'admin' | 'factory';
  totalKg: number;
  snapshot: { code: string; quantityKg: number }[];
  note: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  eventType: ActivityEventType;
  factoryId: string;
  factoryCode: string;
  factoryNameZh: string;
  factoryNameEn: string;
  factoryNameVi: string;
  factoryOwnerUid: string;
  factoryAuthorizedEmail: string;
  actorUsername: string;
  actorRole: 'admin' | 'factory';
  currency: Currency | '';
  totalKg: number;
  details: string;
  note: string;
  createdAt: string;
}

export interface AuthUser {
  uid: string;
  email: string;
  role: 'admin' | 'factory';
  username: string;
  factory?: Factory;
}

export interface AdminOverviewData {
  currency: Currency;
  factories: Factory[];
  grades: Grade[];
  inventory: InventoryItem[];
  factoryPrices: FactoryPrice[];
  recentLogs: InventoryLog[];
  activityLogs: ActivityLog[];
}

export interface FactoryWorkspaceData {
  factory: Factory;
  grades: Grade[];
  inventory: InventoryItem[];
  logs: InventoryLog[];
}

/**
 * Synthetic, obviously fictional fixtures for the design-system lab. No real people,
 * clients, projects or money; fixed dates so visual baselines are deterministic.
 * These are presentation fixtures, not IAM/CRM/Projects/Finance implementations.
 */
import type { IconName, Language, Tone } from '@vertex-os/ui';

type Localized = Readonly<Record<Language, string>>;

export interface StateMapping {
  readonly tone: Tone;
  readonly icon: IconName;
  readonly label: Localized;
}

/** IAM access and provisioning mappings as specified in DESIGN_SYSTEM.md §33 (feature-owned). */
export const ACCESS_STATES = {
  INVITED: { tone: 'info', icon: 'clock', label: { ar: 'مدعو', en: 'Invited' } },
  ACTIVE: { tone: 'success', icon: 'check-circle', label: { ar: 'نشط', en: 'Active' } },
  SUSPENDED: {
    tone: 'warning',
    icon: 'pause-circle',
    label: { ar: 'موقوف مؤقتًا', en: 'Suspended' },
  },
  DISABLED: { tone: 'danger', icon: 'lock', label: { ar: 'معطّل', en: 'Disabled' } },
  TERMINATED: {
    tone: 'neutral',
    icon: 'archive',
    label: { ar: 'منتهي الوصول', en: 'Access ended' },
  },
} as const satisfies Record<string, StateMapping>;

export const PROVISIONING_STATES = {
  PENDING: { tone: 'info', icon: 'clock', label: { ar: 'بانتظار المزامنة', en: 'Awaiting sync' } },
  SYNCED: { tone: 'success', icon: 'check-circle', label: { ar: 'تمت المزامنة', en: 'Synced' } },
  FAILED: {
    tone: 'danger',
    icon: 'alert-circle',
    label: { ar: 'فشلت المزامنة', en: 'Sync failed' },
  },
} as const satisfies Record<string, StateMapping>;

export type AccessState = keyof typeof ACCESS_STATES;
export type ProvisioningState = keyof typeof PROVISIONING_STATES;

export interface DirectoryUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly department: Localized;
  readonly access: AccessState;
  readonly provisioning: ProvisioningState;
  /** Instant with an explicit offset. */
  readonly lastActivity: string | null;
}

const department = {
  design: { ar: 'التصميم', en: 'Design' },
  production: { ar: 'الإنتاج', en: 'Production' },
  accounts: { ar: 'الحسابات', en: 'Accounts' },
  strategy: { ar: 'الاستراتيجية', en: 'Strategy' },
} as const;

export const USERS: readonly DirectoryUser[] = [
  {
    id: 'usr-001',
    name: 'سارة الخطيب (تجريبي)',
    email: 'sara.demo@example.test',
    department: department.design,
    access: 'ACTIVE',
    provisioning: 'SYNCED',
    lastActivity: '2026-09-21T14:05:00Z',
  },
  {
    id: 'usr-002',
    name: 'عبد الرحمن بن ناصر الشهري (تجريبي)',
    email: 'abdulrahman.demo@example.test',
    department: department.production,
    access: 'INVITED',
    provisioning: 'PENDING',
    lastActivity: null,
  },
  {
    id: 'usr-003',
    name: 'Lina Haddad (demo)',
    email: 'lina.demo@example.test',
    department: department.accounts,
    access: 'SUSPENDED',
    provisioning: 'SYNCED',
    lastActivity: '2026-09-18T09:40:00Z',
  },
  {
    id: 'usr-004',
    name: 'مُحَمَّد يوسف (تجريبي)',
    email: 'mohammad.demo@example.test',
    department: department.strategy,
    access: 'DISABLED',
    provisioning: 'FAILED',
    lastActivity: '2026-09-02T17:15:00Z',
  },
  {
    id: 'usr-005',
    name: 'ريم العتيبي (تجريبي)',
    email: 'reem.demo@example.test',
    department: department.design,
    access: 'TERMINATED',
    provisioning: 'SYNCED',
    lastActivity: '2026-07-30T11:00:00Z',
  },
  {
    id: 'usr-006',
    name: 'Omar Farouk (demo)',
    email: 'omar.demo@example.test',
    department: department.production,
    access: 'ACTIVE',
    provisioning: 'SYNCED',
    lastActivity: '2026-09-22T06:30:00Z',
  },
  {
    id: 'usr-007',
    name: 'نورة القحطاني (تجريبي)',
    email: 'noura.demo@example.test',
    department: department.accounts,
    access: 'ACTIVE',
    provisioning: 'FAILED',
    lastActivity: '2026-09-20T12:00:00Z',
  },
  {
    id: 'usr-008',
    name: 'خالد المنصور (تجريبي)',
    email: 'khaled.demo@example.test',
    department: department.strategy,
    access: 'ACTIVE',
    provisioning: 'SYNCED',
    lastActivity: '2026-09-19T08:45:00Z',
  },
];

export interface PermissionGroup {
  readonly id: string;
  readonly label: Localized;
  readonly permissions: readonly {
    readonly code: string;
    readonly label: Localized;
    readonly privileged?: boolean;
  }[];
}

/** Permission codes follow docs/modules/iam.md §19; labels are illustrative fixtures. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    id: 'users',
    label: { ar: 'المستخدمون', en: 'Users' },
    permissions: [
      {
        code: 'iam.users.read',
        label: { ar: 'عرض دليل المستخدمين', en: 'View the user directory' },
      },
      { code: 'iam.users.create', label: { ar: 'دعوة مستخدمين', en: 'Invite users' } },
      { code: 'iam.users.update', label: { ar: 'تعديل بيانات الملف', en: 'Edit profile details' } },
      {
        code: 'iam.users.manage-access',
        label: { ar: 'إيقاف الوصول وتعطيله وإنهاؤه', en: 'Suspend, disable and end access' },
        privileged: true,
      },
    ],
  },
  {
    id: 'roles',
    label: { ar: 'الأدوار والصلاحيات', en: 'Roles and permissions' },
    permissions: [
      { code: 'iam.roles.read', label: { ar: 'عرض الأدوار', en: 'View roles' } },
      {
        code: 'iam.roles.manage',
        label: { ar: 'إدارة الأدوار وصلاحياتها', en: 'Manage roles and their permissions' },
        privileged: true,
      },
      {
        code: 'iam.permissions.read',
        label: { ar: 'عرض فهرس الصلاحيات', en: 'View the permission catalogue' },
      },
    ],
  },
  {
    id: 'sessions',
    label: { ar: 'الجلسات', en: 'Sessions' },
    permissions: [
      {
        code: 'iam.sessions.revoke',
        label: { ar: 'إنهاء جلسات مستخدم آخر', en: "Revoke another user's sessions" },
        privileged: true,
      },
    ],
  },
];

export const INITIAL_ROLE_PERMISSIONS: ReadonlySet<string> = new Set([
  'iam.users.read',
  'iam.users.update',
  'iam.roles.read',
]);

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly stage: 'lead' | 'opportunity' | 'client';
  readonly owner: string;
  readonly city: Localized;
  readonly updated: string;
}

export const CLIENTS: readonly Client[] = [
  {
    id: 'crm-101',
    name: 'شركة الأفق التجريبية',
    stage: 'lead',
    owner: 'سارة الخطيب (تجريبي)',
    city: { ar: 'الرياض', en: 'Riyadh' },
    updated: '2026-09-20',
  },
  {
    id: 'crm-102',
    name: 'Northwind Demo Studio',
    stage: 'opportunity',
    owner: 'Omar Farouk (demo)',
    city: { ar: 'دبي', en: 'Dubai' },
    updated: '2026-09-18',
  },
  {
    id: 'crm-103',
    name: 'مؤسسة النخبة للتجارب',
    stage: 'client',
    owner: 'نورة القحطاني (تجريبي)',
    city: { ar: 'جدة', en: 'Jeddah' },
    updated: '2026-09-11',
  },
  {
    id: 'crm-104',
    name: 'Sample Harbor Co. (demo)',
    stage: 'lead',
    owner: 'سارة الخطيب (تجريبي)',
    city: { ar: 'عمّان', en: 'Amman' },
    updated: '2026-09-02',
  },
  {
    id: 'crm-105',
    name: 'دار الرواية التجريبية',
    stage: 'opportunity',
    owner: 'خالد المنصور (تجريبي)',
    city: { ar: 'الرياض', en: 'Riyadh' },
    updated: '2026-08-29',
  },
];

export const CLIENT_STAGES = {
  lead: { tone: 'neutral', icon: 'minus-circle', label: { ar: 'عميل محتمل', en: 'Lead' } },
  opportunity: { tone: 'info', icon: 'clock', label: { ar: 'فرصة بيعية', en: 'Opportunity' } },
  client: { tone: 'success', icon: 'check-circle', label: { ar: 'عميل', en: 'Client' } },
} as const satisfies Record<Client['stage'], StateMapping>;

export interface LedgerLine {
  readonly id: string;
  readonly description: Localized;
  /** Backend-canonical decimal string or null when not provided. */
  readonly amount: string | null;
  readonly currency: string;
  readonly date: string;
}

export const LEDGER: readonly LedgerLine[] = [
  {
    id: 'INV-2026-0042',
    description: { ar: 'دفعة أولى — حملة الخريف', en: 'First instalment — autumn campaign' },
    amount: '18750.00',
    currency: 'SAR',
    date: '2026-09-01',
  },
  {
    id: 'CRN-2026-0007',
    description: { ar: 'إشعار دائن — تعديل النطاق', en: 'Credit note — scope change' },
    amount: '-1234.50',
    currency: 'SAR',
    date: '2026-09-10',
  },
  {
    id: 'INV-2026-0043',
    description: { ar: 'رسوم ملغاة بالكامل', en: 'Fully waived fee' },
    amount: '0.00',
    currency: 'SAR',
    date: '2026-09-12',
  },
  {
    id: 'INV-2026-0044',
    description: { ar: 'خدمات مستوردة', en: 'Imported services' },
    amount: '4200.00',
    currency: 'USD',
    date: '2026-09-15',
  },
  {
    id: 'INV-2026-0045',
    description: { ar: 'مبلغ بانتظار التسعير', en: 'Awaiting pricing' },
    amount: null,
    currency: 'SAR',
    date: '2026-09-18',
  },
];

/** Totals are backend-provided per currency; the UI never sums money itself (AR-037). */
export const LEDGER_TOTALS: readonly { readonly currency: string; readonly amount: string }[] = [
  { currency: 'SAR', amount: '17515.50' },
  { currency: 'USD', amount: '4200.00' },
];

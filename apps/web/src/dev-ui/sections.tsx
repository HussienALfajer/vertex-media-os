import type { IconName } from '@vertex-os/ui';
import type { ComponentType } from 'react';
import { CrmProof } from './proofs/crm';
import { FinanceSection } from './proofs/finance';
import { IamProof } from './proofs/iam';
import { ProjectsSection } from './proofs/projects';
import { ActionsSection } from './sections/actions';
import { BidiSection } from './sections/bidi';
import { FeedbackSection } from './sections/feedback';
import { FormsSection } from './sections/forms';
import { FoundationsSection } from './sections/foundations';
import { LayoutsSection, PrintSection } from './sections/layouts';
import { NavigationSection } from './sections/navigation';
import { OverlaysSection } from './sections/overlays';
import { TablesSection } from './sections/tables';

export type LabGroup = 'foundations' | 'components' | 'patterns' | 'proofs';

export interface LabSection {
  readonly id: string;
  readonly group: LabGroup;
  readonly icon: IconName;
  readonly title: readonly [ar: string, en: string];
  readonly description: readonly [ar: string, en: string];
  readonly component: ComponentType;
}

export const LAB_GROUPS: readonly {
  readonly id: LabGroup;
  readonly label: readonly [string, string];
}[] = [
  { id: 'foundations', label: ['الأساسيات', 'Foundations'] },
  { id: 'components', label: ['المكوّنات', 'Components'] },
  { id: 'patterns', label: ['الأنماط', 'Patterns'] },
  { id: 'proofs', label: ['سيناريوهات الإثبات', 'Proof scenarios'] },
];

export const LAB_SECTIONS: readonly LabSection[] = [
  {
    id: 'foundations',
    group: 'foundations',
    icon: 'layers',
    title: ['الرموز والطباعة', 'Tokens and type'],
    description: [
      'الألوان والأنماط والمسافات والزوايا والحركة والأيقونات.',
      'Colour, type, spacing, radius, motion and icons.',
    ],
    component: FoundationsSection,
  },
  {
    id: 'bidi',
    group: 'foundations',
    icon: 'globe',
    title: ['النص ثنائي الاتجاه', 'Bidirectional text'],
    description: [
      'عزل المعرفات والبريد والأرقام والمبالغ والتواريخ.',
      'Isolation of IDs, email, numbers, money and dates.',
    ],
    component: BidiSection,
  },
  {
    id: 'actions',
    group: 'components',
    icon: 'cursor',
    title: ['الإجراءات', 'Actions'],
    description: [
      'الأزرار وأزرار الأيقونات والمجموعات وحالاتها.',
      'Buttons, icon buttons, groups and their states.',
    ],
    component: ActionsSection,
  },
  {
    id: 'forms',
    group: 'components',
    icon: 'form',
    title: ['النماذج', 'Forms'],
    description: [
      'الحقول والاختيارات والتحقق وملخص الأخطاء.',
      'Fields, choices, validation and the error summary.',
    ],
    component: FormsSection,
  },
  {
    id: 'feedback',
    group: 'components',
    icon: 'info',
    title: ['الحالات والملاحظات', 'Status and feedback'],
    description: [
      'النغمات والتنبيهات والتقدم والحالات الفارغة والإشعارات.',
      'Tones, alerts, progress, empty states and toasts.',
    ],
    component: FeedbackSection,
  },
  {
    id: 'overlays',
    group: 'components',
    icon: 'layers',
    title: ['الطبقات العائمة', 'Overlays'],
    description: [
      'النوافذ والأدراج والقوائم والتلميحات وملكية الطبقات.',
      'Dialogs, drawers, menus, tooltips and layer ownership.',
    ],
    component: OverlaysSection,
  },
  {
    id: 'navigation',
    group: 'components',
    icon: 'menu',
    title: ['التنقل', 'Navigation'],
    description: ['مسار التنقل والتبويب وترقيم الصفحات.', 'Breadcrumb, tabs and pagination.'],
    component: NavigationSection,
  },
  {
    id: 'tables',
    group: 'components',
    icon: 'table',
    title: ['الجداول', 'Tables'],
    description: [
      'الفرز والتحديد والتمرير والحالات المتمايزة.',
      'Sorting, selection, overflow and distinct states.',
    ],
    component: TablesSection,
  },
  {
    id: 'layouts',
    group: 'patterns',
    icon: 'grid',
    title: ['تخطيطات الصفحات', 'Page layouts'],
    description: ['قواعد الصفحة وعروض المحتوى.', 'Page grammar and content widths.'],
    component: LayoutsSection,
  },
  {
    id: 'print',
    group: 'patterns',
    icon: 'printer',
    title: ['الطباعة', 'Print'],
    description: [
      'عرض فاتح صريح دون أدوات تفاعلية.',
      'Explicit Light presentation without interactive chrome.',
    ],
    component: PrintSection,
  },
  {
    id: 'iam',
    group: 'proofs',
    icon: 'shield',
    title: ['إدارة الهوية والوصول', 'Identity and access'],
    description: [
      'دليل مستخدمين عربي ومحرر صلاحيات وتأكيد حساس.',
      'Arabic user directory, permission editor and sensitive confirmation.',
    ],
    component: IamProof,
  },
  {
    id: 'crm',
    group: 'proofs',
    icon: 'briefcase',
    title: ['العملاء', 'Clients'],
    description: [
      'قائمة مصفّاة ولا نتائج وسياق عودة محفوظ.',
      'Filtered list, no results and preserved return context.',
    ],
    component: CrmProof,
  },
  {
    id: 'projects',
    group: 'proofs',
    icon: 'folder',
    title: ['المشاريع', 'Projects'],
    description: [
      'رأس سجل ومفتش واسم ملف مختلط اللغة.',
      'Record header, inspector and a mixed-language filename.',
    ],
    component: ProjectsSection,
  },
  {
    id: 'finance',
    group: 'proofs',
    icon: 'wallet',
    title: ['المالية', 'Finance'],
    description: [
      'مبالغ دقيقة وعملة صريحة وتعارض ونتيجة غير مؤكدة.',
      'Exact amounts, explicit currency, conflict and uncertain outcome.',
    ],
    component: FinanceSection,
  },
];

import type { Language } from './settings';

/**
 * Design-system chrome copy (DS-D023). Domain wording belongs to features; this catalogue
 * only names the shared controls and states the design system itself renders.
 * Arabic follows docs/DESIGN_SYSTEM.md §38; counts use locale plural rules and Latin digits.
 */
type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface UiMessages {
  readonly close: string;
  readonly cancel: string;
  readonly unsavedTitle: string;
  readonly unsavedDescription: string;
  readonly continueEditing: string;
  readonly discardChanges: string;
  readonly pendingDismissal: string;
  readonly dismissNotification: string;
  readonly notifications: string;
  readonly skipToContent: string;
  readonly mainNavigation: string;
  readonly openNavigation: string;
  readonly collapseNavigation: string;
  readonly expandNavigation: string;
  readonly breadcrumb: string;
  readonly moreAncestors: string;
  readonly pagination: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly rowsPerPage: string;
  readonly pageOf: (page: number, pages: number) => string;
  readonly range: (first: number, last: number, total: number) => string;
  readonly clearSearch: string;
  readonly required: string;
  readonly requiredNote: string;
  readonly optional: string;
  readonly loading: string;
  readonly working: string;
  readonly stillWorking: string;
  readonly refreshing: string;
  readonly retry: string;
  readonly errorSummaryTitle: (count: number) => string;
  readonly selectPageRows: string;
  readonly selectRow: (label: string) => string;
  readonly selectionSummary: (selected: number, offPage: number) => string;
  readonly selectionCleared: string;
  readonly clearSelection: string;
  readonly unavailableSelection: string;
  readonly sortAscending: (column: string) => string;
  readonly sortDescending: (column: string) => string;
  readonly sortCleared: (column: string) => string;
  readonly scrollTable: string;
  readonly noResultsTitle: string;
  readonly noResultsDescription: string;
  readonly clearFilters: string;
  readonly removeFilter: (label: string) => string;
  readonly activeFilters: string;
  readonly displayPreferences: string;
  readonly language: string;
  readonly theme: string;
  readonly density: string;
  readonly themeSystem: string;
  readonly themeLight: string;
  readonly themeDark: string;
  readonly densityDefault: string;
  readonly densityCompact: string;
  readonly densityCoarseNote: string;
  readonly homeDestination: string;
  readonly notApplicable: string;
  readonly percentFormat: (value: number) => string;
}

const number = (language: Language, value: number) =>
  new Intl.NumberFormat(language, { numberingSystem: 'latn' }).format(value);
const plural = (language: Language, value: number, forms: Plural) => {
  const rule = new Intl.PluralRules(language).select(value);
  return (forms[rule] ?? forms.other).replace('{n}', number(language, value));
};

const ar: UiMessages = {
  close: 'إغلاق',
  cancel: 'إلغاء',
  unsavedTitle: 'لديك تغييرات غير محفوظة',
  unsavedDescription: 'إذا تجاهلتها فلن تُحفظ. يمكنك متابعة التحرير والحفظ أولًا.',
  continueEditing: 'متابعة التحرير',
  discardChanges: 'تجاهل التغييرات',
  pendingDismissal: 'لا يمكن الإغلاق حتى تكتمل العملية الجارية.',
  dismissNotification: 'إغلاق الإشعار',
  notifications: 'الإشعارات',
  skipToContent: 'الانتقال إلى المحتوى',
  mainNavigation: 'التنقل الرئيسي',
  openNavigation: 'فتح التنقل',
  collapseNavigation: 'طي التنقل',
  expandNavigation: 'توسيع التنقل',
  breadcrumb: 'مسار التنقل',
  moreAncestors: 'المستويات الأعلى',
  pagination: 'صفحات النتائج',
  previousPage: 'الصفحة السابقة',
  nextPage: 'الصفحة التالية',
  rowsPerPage: 'عدد السجلات في الصفحة',
  pageOf: (page, pages) => `الصفحة ${number('ar', page)} من ${number('ar', pages)}`,
  range: (first, last, total) =>
    `${number('ar', first)}–${number('ar', last)} من ${number('ar', total)}`,
  clearSearch: 'مسح البحث',
  required: 'مطلوب',
  requiredNote: 'الحقول المعلَّمة بـ * مطلوبة.',
  optional: 'اختياري',
  loading: 'جارٍ التحميل…',
  working: 'جارٍ التنفيذ…',
  stillWorking: 'لا يزال العمل جاريًا. سيظهر الناتج عند اكتماله.',
  refreshing: 'جارٍ تحديث النتائج…',
  retry: 'إعادة المحاولة',
  errorSummaryTitle: (count) =>
    plural('ar', count, {
      one: 'يوجد خطأ واحد يحتاج إلى تصحيح',
      two: 'يوجد خطآن يحتاجان إلى تصحيح',
      few: 'توجد {n} أخطاء تحتاج إلى تصحيح',
      many: 'يوجد {n} خطأً يحتاج إلى تصحيح',
      other: 'يوجد {n} خطأ يحتاج إلى تصحيح',
    }),
  selectPageRows: 'تحديد السجلات المتاحة في هذه الصفحة',
  selectRow: (label) => `تحديد ${label}`,
  selectionSummary: (selected, offPage) => {
    const count = plural('ar', selected, {
      zero: 'لم يُحدَّد أي سجل',
      one: 'تم تحديد سجل واحد',
      two: 'تم تحديد سجلين',
      few: 'تم تحديد {n} سجلات',
      many: 'تم تحديد {n} سجلًا',
      other: 'تم تحديد {n} سجل',
    });
    return offPage > 0 ? `${count}، منها ${number('ar', offPage)} خارج هذه الصفحة` : count;
  },
  selectionCleared: 'تم إلغاء التحديد لأن نطاق النتائج تغيّر.',
  clearSelection: 'إلغاء التحديد',
  unavailableSelection: 'غير متاح للتحديد',
  sortAscending: (column) => `مرتب حسب ${column} تصاعديًا`,
  sortDescending: (column) => `مرتب حسب ${column} تنازليًا`,
  sortCleared: (column) => `أُلغي الترتيب حسب ${column}`,
  scrollTable: 'مرّر أفقيًا لعرض بقية الأعمدة.',
  noResultsTitle: 'لا توجد نتائج مطابقة',
  noResultsDescription: 'جرّب تعديل عوامل التصفية.',
  clearFilters: 'مسح عوامل التصفية',
  removeFilter: (label) => `إزالة عامل التصفية: ${label}`,
  activeFilters: 'عوامل التصفية النشطة',
  displayPreferences: 'تفضيلات العرض',
  language: 'اللغة',
  theme: 'المظهر',
  density: 'الكثافة',
  themeSystem: 'حسب النظام',
  themeLight: 'فاتح',
  themeDark: 'داكن',
  densityDefault: 'افتراضية',
  densityCompact: 'مضغوطة',
  densityCoarseNote: 'تُستخدم الكثافة الافتراضية دائمًا مع شاشات اللمس.',
  homeDestination: 'الانتقال إلى الرئيسية',
  notApplicable: 'غير محدد',
  percentFormat: (value) =>
    new Intl.NumberFormat('ar', {
      style: 'percent',
      numberingSystem: 'latn',
      maximumFractionDigits: 1,
    }).format(value),
};

const en: UiMessages = {
  close: 'Close',
  cancel: 'Cancel',
  unsavedTitle: 'You have unsaved changes',
  unsavedDescription:
    'If you discard them they will not be saved. You can continue editing and save first.',
  continueEditing: 'Continue editing',
  discardChanges: 'Discard changes',
  pendingDismissal: 'This cannot close until the running operation finishes.',
  dismissNotification: 'Dismiss notification',
  notifications: 'Notifications',
  skipToContent: 'Skip to content',
  mainNavigation: 'Main navigation',
  openNavigation: 'Open navigation',
  collapseNavigation: 'Collapse navigation',
  expandNavigation: 'Expand navigation',
  breadcrumb: 'Breadcrumb',
  moreAncestors: 'Higher levels',
  pagination: 'Result pages',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  rowsPerPage: 'Rows per page',
  pageOf: (page, pages) => `Page ${number('en', page)} of ${number('en', pages)}`,
  range: (first, last, total) =>
    `${number('en', first)}–${number('en', last)} of ${number('en', total)}`,
  clearSearch: 'Clear search',
  required: 'Required',
  requiredNote: 'Fields marked * are required.',
  optional: 'Optional',
  loading: 'Loading…',
  working: 'Working…',
  stillWorking: 'This is still in progress. The outcome will appear when it completes.',
  refreshing: 'Refreshing results…',
  retry: 'Try again',
  errorSummaryTitle: (count) =>
    plural('en', count, { one: '1 error needs correcting', other: '{n} errors need correcting' }),
  selectPageRows: 'Select available records on this page',
  selectRow: (label) => `Select ${label}`,
  selectionSummary: (selected, offPage) => {
    const count =
      selected === 0
        ? 'No records selected'
        : plural('en', selected, { one: '1 record selected', other: '{n} records selected' });
    return offPage > 0 ? `${count}, ${number('en', offPage)} outside this page` : count;
  },
  selectionCleared: 'Selection cleared because the result scope changed.',
  clearSelection: 'Clear selection',
  unavailableSelection: 'Not available for selection',
  sortAscending: (column) => `Sorted by ${column}, ascending`,
  sortDescending: (column) => `Sorted by ${column}, descending`,
  sortCleared: (column) => `Sorting by ${column} removed`,
  scrollTable: 'Scroll horizontally to see the remaining columns.',
  noResultsTitle: 'No matching results',
  noResultsDescription: 'Try adjusting the filters.',
  clearFilters: 'Clear filters',
  removeFilter: (label) => `Remove filter: ${label}`,
  activeFilters: 'Active filters',
  displayPreferences: 'Display preferences',
  language: 'Language',
  theme: 'Theme',
  density: 'Density',
  themeSystem: 'Match system',
  themeLight: 'Light',
  themeDark: 'Dark',
  densityDefault: 'Default',
  densityCompact: 'Compact',
  densityCoarseNote: 'Touch screens always use the default density.',
  homeDestination: 'Go to home',
  notApplicable: 'Not specified',
  percentFormat: (value) =>
    new Intl.NumberFormat('en', {
      style: 'percent',
      numberingSystem: 'latn',
      maximumFractionDigits: 1,
    }).format(value),
};

export const UI_MESSAGES: Readonly<Record<Language, UiMessages>> = { ar, en };

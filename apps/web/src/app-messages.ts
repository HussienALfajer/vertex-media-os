import { useUiSettings, type Language } from '@vertex-os/ui';

/**
 * Application copy owned by the web app's technical shell (not design-system chrome).
 * Arabic is the first-run language; English is complete.
 */
const messages = {
  ar: {
    productDescription: 'المنصة التشغيلية الداخلية لـ Vertex Media.',
    home: 'الرئيسية',
    systemStatus: 'حالة النظام',
    apiPending: 'جارٍ التحقق من الاتصال بالواجهة البرمجية…',
    apiAvailable: 'الاتصال بالواجهة البرمجية متاح',
    apiUnavailable: 'الاتصال بالواجهة البرمجية غير متاح',
    apiUnavailableDetail: 'تعذّر الوصول إلى الواجهة البرمجية لـ Vertex OS. يُعاد التحقق تلقائيًا.',
    notFoundTitle: 'الصفحة غير موجودة',
    notFoundDescription: 'لا توجد صفحة بهذا العنوان، أو لم تعد متاحة.',
    backHome: 'العودة إلى الرئيسية',
  },
  en: {
    productDescription: 'Internal operating platform of Vertex Media.',
    home: 'Home',
    systemStatus: 'System status',
    apiPending: 'Checking API connection…',
    apiAvailable: 'API connection available',
    apiUnavailable: 'API connection unavailable',
    apiUnavailableDetail:
      'The Vertex OS API could not be reached. The connection is re-checked automatically.',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'There is no page at this address, or it is no longer available.',
    backHome: 'Back to home',
  },
} satisfies Record<Language, Record<string, string>>;

export type AppMessages = (typeof messages)['ar'];

export function useAppMessages(): AppMessages {
  return messages[useUiSettings().language];
}

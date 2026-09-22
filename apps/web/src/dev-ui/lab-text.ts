import { useUiSettings } from '@vertex-os/ui';

/**
 * Bilingual lab copy. The lab is an internal verification surface, so its own wording stays
 * next to each specimen instead of in a product catalogue.
 */
export function useLabText(): (ar: string, en: string) => string {
  const { language } = useUiSettings();
  return (ar, en) => (language === 'ar' ? ar : en);
}

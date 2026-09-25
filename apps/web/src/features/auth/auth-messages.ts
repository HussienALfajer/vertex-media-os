import { useUiSettings, type Language } from '@vertex-os/ui';

/** Copy of the authentication and session states (DESIGN_SYSTEM Sections 34 and 38). */
const messages = {
  ar: {
    signInTitle: 'تسجيل الدخول إلى Vertex OS',
    signInDescription: 'أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى Vertex OS.',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    signIn: 'تسجيل الدخول',
    signingIn: 'جارٍ تسجيل الدخول…',
    sessionExpiredTitle: 'انتهت الجلسة',
    sessionExpiredDetail: 'انتهت الجلسة. سجّل الدخول للمتابعة.',
    sessionEndedTitle: 'انتهت الجلسة',
    sessionEndedDetail:
      'لم تعد الجلسة صالحة، ربما بسبب تسجيل الخروج من مكان آخر. سجّل الدخول للمتابعة.',
    inactiveTitle: 'الوصول غير متاح',
    inactiveDetail: 'حسابك غير مفعّل حاليًا في Vertex OS. تواصل مع مسؤول النظام.',
    loginFailedTitle: 'تعذّر إكمال تسجيل الدخول',
    loginFailedDetail: 'لم يكتمل تسجيل الدخول. حاول مرة أخرى.',
    rateLimitedTitle: 'محاولات تسجيل دخول كثيرة',
    rateLimitedDetail:
      'وصلت محاولات تسجيل الدخول من هذا الجهاز أو الشبكة إلى الحد المسموح. انتظر دقيقة ثم حاول مرة أخرى.',
    loadingSession: 'جارٍ التحقق من الجلسة…',
    unavailableTitle: 'تعذّر التحقق من الجلسة',
    unavailableDetail: 'تعذّر الوصول إلى Vertex OS. تحقّق من الاتصال ثم أعد المحاولة.',
    account: 'الحساب',
    signOut: 'تسجيل الخروج',
    signingOut: 'جارٍ تسجيل الخروج…',
    signOutFailed: 'تعذّر تسجيل الخروج. تحقّق من الاتصال ثم أعد المحاولة.',
  },
  en: {
    signInTitle: 'Sign in to Vertex OS',
    signInDescription: 'Enter your email and password to access Vertex OS.',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    sessionExpiredTitle: 'Session expired',
    sessionExpiredDetail: 'Your session has expired. Sign in to continue.',
    sessionEndedTitle: 'Session ended',
    sessionEndedDetail:
      'Your session is no longer valid, possibly because you signed out elsewhere. Sign in to continue.',
    inactiveTitle: 'Access unavailable',
    inactiveDetail: 'Your Vertex OS account is not active. Contact your system administrator.',
    loginFailedTitle: 'Sign-in could not be completed',
    loginFailedDetail: 'Sign-in did not complete. Try again.',
    rateLimitedTitle: 'Too many sign-in attempts',
    rateLimitedDetail:
      'Sign-in attempts from this device or network reached the limit. Wait a minute, then try again.',
    loadingSession: 'Checking your session…',
    unavailableTitle: 'Session could not be checked',
    unavailableDetail: 'Vertex OS could not be reached. Check your connection and try again.',
    account: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signOutFailed: 'Sign-out failed. Check your connection and try again.',
  },
} satisfies Record<Language, Record<string, string>>;

export type AuthMessages = (typeof messages)['ar'];

export function useAuthMessages(): AuthMessages {
  return messages[useUiSettings().language];
}

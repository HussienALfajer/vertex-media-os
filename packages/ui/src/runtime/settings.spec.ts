import { afterEach, describe, expect, it, vi } from 'vitest';
import { installUiSettings, parsePreferences, UI_PREFERENCE_KEY } from './settings';

function stubMedia(matches: (query: string) => boolean) {
  const listeners = new Map<string, () => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return matches(query);
      },
      addEventListener: (_type: string, listener: () => void) => listeners.set(query, listener),
      removeEventListener: () => listeners.delete(query),
    })),
  );
  return (query: string) => listeners.get(query)?.();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('root UI settings', () => {
  it('applies Arabic RTL, the system theme and Default density on first run', () => {
    const store = installUiSettings();
    expect(store.getSnapshot()).toMatchObject({
      language: 'ar',
      direction: 'rtl',
      theme: 'system',
      resolvedTheme: 'light',
      density: 'default',
      effectiveDensity: 'default',
    });
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('is installed once per document, so the head bootstrap and React share one store', () => {
    expect(installUiSettings()).toBe(installUiSettings());
  });

  it('follows the system theme only while the preference is system', () => {
    let dark = true;
    const fire = stubMedia((query) => query.includes('dark') && dark);
    const store = installUiSettings();
    expect(store.getSnapshot().resolvedTheme).toBe('dark');
    dark = false;
    fire('(prefers-color-scheme: dark)');
    expect(document.documentElement.dataset['theme']).toBe('light');
    store.set({ theme: 'dark' });
    fire('(prefers-color-scheme: dark)');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('keeps editing, focus, selection and DOM identity across live mode changes', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.value = 'مسودة Draft';
    input.focus();
    input.setSelectionRange(1, 4);
    const store = installUiSettings();
    store.set({ theme: 'dark', language: 'en', density: 'compact' });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('مسودة Draft');
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.dataset['density']).toBe('compact');
    input.remove();
  });

  it('persists only the versioned non-sensitive preference record', () => {
    installUiSettings().set({ language: 'en', theme: 'light' });
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCE_KEY) ?? '{}')).toEqual({
      version: 1,
      language: 'en',
      theme: 'light',
      density: 'default',
    });
  });

  it('discards unknown versions, values and extra fields', () => {
    expect(
      parsePreferences({ version: 1, theme: 'sepia', language: 'fa', density: 'tiny', token: 'x' }),
    ).toEqual({
      version: 1,
      theme: 'system',
      language: 'ar',
      density: 'default',
    });
    expect(parsePreferences({ version: 2, language: 'en' }).language).toBe('ar');
    expect(parsePreferences('not an object').language).toBe('ar');
    localStorage.setItem(UI_PREFERENCE_KEY, '{corrupt');
    expect(installUiSettings().getSnapshot().language).toBe('ar');
  });

  it('resolves a coarse pointer to Default geometry while keeping the saved preference', () => {
    stubMedia((query) => query.includes('coarse'));
    const store = installUiSettings();
    store.set({ density: 'compact' });
    expect(store.getSnapshot()).toMatchObject({
      density: 'compact',
      effectiveDensity: 'default',
      coarsePointer: true,
    });
    expect(document.documentElement.dataset['density']).toBe('default');
  });

  it('keeps working when storage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const store = installUiSettings();
    store.set({ theme: 'dark' });
    expect(store.getSnapshot().resolvedTheme).toBe('dark');
  });

  it('follows preference changes made in another tab', () => {
    const store = installUiSettings();
    localStorage.setItem(UI_PREFERENCE_KEY, JSON.stringify({ version: 1, language: 'en' }));
    window.dispatchEvent(new StorageEvent('storage', { key: UI_PREFERENCE_KEY }));
    expect(store.getSnapshot().language).toBe('en');
  });
});

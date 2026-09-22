/**
 * Root UI settings (docs/DESIGN_SYSTEM.md §40.1).
 *
 * This module is compiled twice from the same source: into the blocking same-origin head
 * script that applies language, direction, theme and density before first paint, and into
 * the React bundle, which reuses the store the head script installed. It must therefore
 * stay free of imports, React and any business or authentication state.
 */
export type Language = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';
export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';
export type Density = 'default' | 'compact';

/** The only persisted data: non-sensitive UI preferences under a versioned schema. */
export interface UiPreferences {
  readonly version: 1;
  readonly language: Language;
  readonly theme: ThemePreference;
  readonly density: Density;
}

export interface UiSettings extends UiPreferences {
  readonly direction: Direction;
  readonly resolvedTheme: Theme;
  readonly effectiveDensity: Density;
  /** True when a coarse primary pointer forces Default geometry (§14). */
  readonly coarsePointer: boolean;
}

export type PreferenceChange = Partial<Omit<UiPreferences, 'version'>>;

export interface SettingsStore {
  readonly getSnapshot: () => UiSettings;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (change: PreferenceChange) => void;
  readonly dispose: () => void;
}

declare global {
  interface Window {
    vertexUiSettings?: SettingsStore;
  }
}

export const UI_PREFERENCE_KEY = 'vertex.ui.preferences';

export const DEFAULT_PREFERENCES: UiPreferences = {
  version: 1,
  language: 'ar',
  theme: 'system',
  density: 'default',
};

/** Accepts only known values; anything else, including extra fields, is discarded. */
export function parsePreferences(value: unknown): UiPreferences {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1)
    return DEFAULT_PREFERENCES;
  const record = value as Record<string, unknown>;
  const theme = record['theme'];
  return {
    version: 1,
    language: record['language'] === 'en' ? 'en' : 'ar',
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    density: record['density'] === 'compact' ? 'compact' : 'default',
  };
}

/** Installs (once per document) the store that owns the root attributes. */
export function installUiSettings(): SettingsStore {
  const existing = window.vertexUiSettings;
  if (existing) return existing;

  const query = (media: string) =>
    typeof window.matchMedia === 'function' ? window.matchMedia(media) : undefined;
  const prefersDark = query('(prefers-color-scheme: dark)');
  const coarse = query('(pointer: coarse)');
  const listeners = new Set<() => void>();

  const read = (): UiPreferences => {
    try {
      const stored = window.localStorage.getItem(UI_PREFERENCE_KEY);
      return stored === null ? DEFAULT_PREFERENCES : parsePreferences(JSON.parse(stored));
    } catch {
      // Denied or corrupt storage is a supported mode: fall back to defaults.
      return DEFAULT_PREFERENCES;
    }
  };

  let preferences = read();
  const resolve = (): UiSettings => {
    const coarsePointer = coarse?.matches === true;
    return {
      ...preferences,
      direction: preferences.language === 'ar' ? 'rtl' : 'ltr',
      resolvedTheme:
        preferences.theme === 'system'
          ? prefersDark?.matches === true
            ? 'dark'
            : 'light'
          : preferences.theme,
      effectiveDensity: coarsePointer ? 'default' : preferences.density,
      coarsePointer,
    };
  };

  let snapshot = resolve();
  const apply = () => {
    const next = resolve();
    const root = document.documentElement;
    root.lang = next.language;
    root.dir = next.direction;
    root.dataset['theme'] = next.resolvedTheme;
    root.dataset['density'] = next.effectiveDensity;
    const changed = (Object.keys(next) as (keyof UiSettings)[]).some(
      (key) => next[key] !== snapshot[key],
    );
    snapshot = next;
    if (changed) for (const listener of listeners) listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== UI_PREFERENCE_KEY && event.key !== null) return;
    preferences = read();
    apply();
  };

  prefersDark?.addEventListener('change', apply);
  coarse?.addEventListener('change', apply);
  window.addEventListener('storage', onStorage);

  const store: SettingsStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (change) => {
      preferences = parsePreferences({ ...preferences, ...change });
      try {
        window.localStorage.setItem(UI_PREFERENCE_KEY, JSON.stringify(preferences));
      } catch {
        // Keep the in-memory preference when storage is denied.
      }
      apply();
    },
    dispose: () => {
      prefersDark?.removeEventListener('change', apply);
      coarse?.removeEventListener('change', apply);
      window.removeEventListener('storage', onStorage);
      listeners.clear();
      delete window.vertexUiSettings;
    },
  };
  window.vertexUiSettings = store;
  apply();
  return store;
}

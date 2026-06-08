import type { AppSettings } from './types';

const SETTINGS_KEY = 'myvinyl:settings';

const SETTINGS_VERSION = 3;

const defaultSettings: AppSettings = {
  theme: 'system',
  viewMode: 'grid',
  onboardingComplete: true,
};

function normalizeViewMode(mode: unknown): AppSettings['viewMode'] {
  if (mode === 'grid' || mode === 'list' || mode === 'shelf') return mode;
  return defaultSettings.viewMode;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };

    const parsed = JSON.parse(raw) as AppSettings & { settingsVersion?: number };
    const version = parsed.settingsVersion ?? 1;
    let viewMode = normalizeViewMode(parsed.viewMode);

    // v1 stored "grid" for what is now the list/table view
    if (version < SETTINGS_VERSION && viewMode === 'grid') {
      viewMode = 'list';
    }

    return {
      ...defaultSettings,
      ...parsed,
      viewMode,
      onboardingComplete: true,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...settings, settingsVersion: SETTINGS_VERSION })
  );
}

/** Temporary client id before Supabase assigns a UUID on insert. */
export function generateId(): string {
  return `mv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
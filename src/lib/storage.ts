import type { AppSettings } from './types';

const SETTINGS_KEY = 'myvinyl:settings';

const defaultSettings: AppSettings = {
  theme: 'system',
  viewMode: 'grid',
  onboardingComplete: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...(JSON.parse(raw) as AppSettings) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Temporary client id before Supabase assigns a UUID on insert. */
export function generateId(): string {
  return `mv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
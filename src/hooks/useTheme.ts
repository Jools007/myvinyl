import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../lib/storage';
import type { AppSettings } from '../lib/types';

type ResolvedTheme = 'light' | 'dark';

function resolveTheme(setting: AppSettings['theme']): ResolvedTheme {
  if (setting === 'light' || setting === 'dark') return setting;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [themeSetting, setThemeSetting] = useState<AppSettings['theme']>(() => loadSettings().theme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    typeof document !== 'undefined'
      ? resolveTheme(loadSettings().theme)
      : 'dark'
  );

  const apply = useCallback((t: ResolvedTheme) => {
    document.documentElement.setAttribute('data-theme', t);
    setResolved(t);
  }, []);

  useEffect(() => {
    apply(resolveTheme(themeSetting));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (themeSetting === 'system') apply(resolveTheme('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeSetting, apply]);

  const setTheme = useCallback((next: AppSettings['theme']) => {
    setThemeSetting(next);
    const s = loadSettings();
    saveSettings({ ...s, theme: next });
    apply(resolveTheme(next));
  }, [apply]);

  const toggle = useCallback(() => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolved, setTheme]);

  return { themeSetting, resolved, setTheme, toggle, isDark: resolved === 'dark' };
}
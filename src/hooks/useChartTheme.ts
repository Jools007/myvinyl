import { useEffect, useState } from 'react';

export type ChartTheme = {
  text: string;
  textMuted: string;
  accent: string;
  violet: string;
  teal: string;
  gold: string;
  border: string;
  elevated: string;
  isDark: boolean;
  palette: string[];
};

function readCssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readChartTheme(): ChartTheme {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const accent = readCssVar('--accent') || '#15655e';
  const violet = readCssVar('--violet') || '#5a46a3';
  const teal = readCssVar('--teal') || '#1a7d72';
  const gold = readCssVar('--gold') || '#9a7209';
  const text = readCssVar('--text') || '#1c1916';
  const textMuted = readCssVar('--text-muted') || '#6f675c';
  const border = readCssVar('--border') || 'rgba(0,0,0,0.1)';
  const elevated = readCssVar('--bg-elevated') || '#fffcf8';

  return {
    text,
    textMuted,
    accent,
    violet,
    teal,
    gold,
    border,
    elevated,
    isDark,
    palette: [accent, violet, '#e07b54', teal, gold, '#5b9fd4', '#9b8fd4', '#6bc9a8'],
  };
}

const FALLBACK_THEME: ChartTheme = {
  text: '#1c1916',
  textMuted: '#6f675c',
  accent: '#15655e',
  violet: '#5a46a3',
  teal: '#1a7d72',
  gold: '#9a7209',
  border: 'rgba(0,0,0,0.1)',
  elevated: '#fffcf8',
  isDark: false,
  palette: ['#15655e', '#5a46a3', '#e07b54', '#1a7d72', '#9a7209', '#5b9fd4', '#9b8fd4', '#6bc9a8'],
};

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() =>
    typeof document !== 'undefined' ? readChartTheme() : FALLBACK_THEME
  );

  useEffect(() => {
    const sync = () => setTheme(readChartTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  return theme;
}

export function chartFont(size = 11, weight: number | 'bold' | 'normal' = 500) {
  const family =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() ||
        '"Inter", ui-sans-serif, system-ui, sans-serif'
      : '"Inter", ui-sans-serif, system-ui, sans-serif';
  return {
    family,
    size,
    weight,
  };
}

export function baseChartOptions(theme: ChartTheme) {
  const gridColor = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,24,18,0.06)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 480, easing: 'easeOutQuart' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.isDark ? 'rgba(20,20,22,0.95)' : 'rgba(255,252,248,0.98)',
        titleColor: theme.text,
        bodyColor: theme.textMuted,
        borderColor: theme.border,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: chartFont(12, 600),
        bodyFont: chartFont(11, 500),
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: theme.textMuted, font: chartFont(11, 500), padding: 6 },
        border: { display: false },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: theme.textMuted, font: chartFont(11, 500), padding: 6 },
        border: { display: false },
      },
    },
  };
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith('rgb')) return color;
  return color;
}
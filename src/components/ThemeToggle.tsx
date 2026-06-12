import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface ThemeToggleProps {
  /** Icon-only control for cramped mobile headers */
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { isDark, toggle } = useTheme();
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="nav-theme-compact inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] shadow-[var(--shadow)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-[0.96]"
      >
        {isDark ? (
          <Moon className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Sun className="h-4 w-4" strokeWidth={2} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="group relative flex h-9 w-[4.25rem] items-center rounded-full p-1 transition-colors duration-500"
      style={{ background: 'var(--toggle-track)' }}
    >
      <motion.div
        className="absolute flex h-7 w-7 items-center justify-center rounded-full shadow-md"
        style={{ background: 'var(--toggle-thumb)' }}
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        animate={{ x: isDark ? 0 : '2.25rem' }}
      >
        <motion.span
          key={isDark ? 'moon' : 'sun'}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
        >
          {isDark ? (
            <Moon className="h-3.5 w-3.5 text-[var(--violet)]" strokeWidth={2} />
          ) : (
            <Sun className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2} />
          )}
        </motion.span>
      </motion.div>
      <Sun
        className="ml-1.5 h-3 w-3 opacity-40 transition-opacity group-hover:opacity-60"
        style={{ color: isDark ? 'var(--text-muted)' : 'var(--accent)' }}
      />
      <Moon
        className="ml-auto mr-1.5 h-3 w-3 opacity-40 transition-opacity group-hover:opacity-60"
        style={{ color: isDark ? 'var(--violet)' : 'var(--text-muted)' }}
      />
    </button>
  );
}
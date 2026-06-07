import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
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
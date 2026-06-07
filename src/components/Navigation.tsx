import { motion } from 'framer-motion';
import { LayoutGrid, Play, Plus, Printer, Scan } from 'lucide-react';
import { UserMenu } from './Auth/UserMenu';
import { MyVinylBrandMark } from './MyVinylBrandMark';
import { ThemeToggle } from './ThemeToggle';

export type NavPage = 'collection' | 'play' | 'labels';

interface NavigationProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  recordCount: number;
  onScan?: () => void;
  onAddRecord?: () => void;
}

const links: { id: NavPage; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'collection', label: 'Collection', icon: LayoutGrid },
  { id: 'play', label: 'Play', icon: Play },
  { id: 'labels', label: 'Labels', icon: Printer },
];

export function Navigation({ page, onNavigate, recordCount, onScan, onAddRecord }: NavigationProps) {
  const handleAddRecord = () => {
    onNavigate('collection');
    onAddRecord?.();
  };

  const countLabel = recordCount === 1 ? 'record' : 'records';

  return (
    <header className="no-print app-nav sticky top-0 z-50 border-b border-[var(--border)] glass-panel">
      <div className="mx-auto flex h-12 sm:h-16 max-w-7xl items-center justify-between gap-3 sm:gap-4 px-3 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('collection')}
          className="app-brand"
          aria-label={`MyVinyl home — ${recordCount} ${countLabel} in collection`}
        >
          <MyVinylBrandMark className="app-brand__mark" size={36} />
          <span className="app-brand__copy">
            <span className="app-brand__wordmark" style={{ fontFamily: 'var(--font-display)' }}>
              MyVinyl
            </span>
            <span className="app-brand__meta tabular-nums">
              {recordCount} {countLabel}
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] p-1 sm:flex">
          {links.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className="relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
                style={{ color: active ? 'var(--text)' : 'var(--text-secondary)' }}
              >
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-[var(--bg-elevated)] shadow-sm"
                    style={{ border: '1px solid var(--border)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="relative h-4 w-4" strokeWidth={active ? 2 : 1.5} />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => onScan?.()}
            className="nav-scan-btn"
            aria-label="Scan barcode"
            title="Scan barcode"
          >
            <Scan className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" strokeWidth={2} />
          </button>
          <UserMenu />
          <button
            type="button"
            onClick={handleAddRecord}
            className="btn-primary inline-flex h-5 text-[9px] py-0 px-1 sm:h-auto sm:text-[0.8125rem] sm:py-[0.625rem] sm:px-[1.25rem]"
          >
            <Plus className="h-2 w-2 sm:h-4 sm:w-4" />
            Add vinyl
          </button>
          <button
            type="button"
            onClick={handleAddRecord}
            className="hidden"
            aria-label="Add record from Discogs"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      <div className="flex border-t border-[var(--border)] sm:hidden">
        {links.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ color: page === id ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
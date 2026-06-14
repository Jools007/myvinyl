import { motion } from 'framer-motion';
import { BarChart3, LayoutGrid, Play, Plus, Printer, Scan } from 'lucide-react';
import type { ReactNode } from 'react';
import { buildAppHref, locationForPage } from '../lib/appRoute';
import type { PlaySelection } from '../lib/playSession';
import { UserMenu } from './Auth/UserMenu';
import { MyVinylBrandMark } from './MyVinylBrandMark';
import { ThemeToggle } from './ThemeToggle';

export type NavPage = 'collection' | 'insights' | 'play' | 'labels';

interface NavigationProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  recordCount: number;
  playSelection?: PlaySelection | null;
  onScan?: () => void;
  onAddRecord?: () => void;
  searchSlot?: ReactNode;
}

const staticLinks: { id: NavPage; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'collection', label: 'Collection', icon: LayoutGrid },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'play', label: 'Play', icon: Play },
  { id: 'labels', label: 'Labels', icon: Printer },
];

function hrefForPage(page: NavPage, playSelection?: PlaySelection | null): string {
  return buildAppHref(
    locationForPage(page, page === 'play' ? { playSelection: playSelection ?? null } : undefined)
  );
}

export function Navigation({
  page,
  onNavigate,
  recordCount,
  playSelection = null,
  onScan,
  onAddRecord,
  searchSlot,
}: NavigationProps) {
  const links = staticLinks.map((link) => ({
    ...link,
    href: hrefForPage(link.id, link.id === 'play' ? playSelection : null),
  }));

  const countLabel = recordCount === 1 ? 'record' : 'records';

  return (
    <>
      <header className="no-print app-nav app-nav--with-search sticky top-0 z-[60] border-b border-[var(--border)] glass-panel">
        <div className="app-nav__inner mx-auto max-w-7xl px-2 sm:px-6">
          <div className="app-nav__grid">
            <a
              href={buildAppHref(locationForPage('collection'))}
              onClick={(event) => {
                event.preventDefault();
                onNavigate('collection');
              }}
              className="app-brand app-nav__brand"
              aria-label={`MyVinyl home — ${recordCount} ${countLabel} in collection`}
            >
              <MyVinylBrandMark className="app-brand__mark app-brand__mark--mobile" size={24} />
              <MyVinylBrandMark className="app-brand__mark app-brand__mark--desktop" size={36} />
              <span className="app-brand__copy">
                <span className="app-brand__wordmark" style={{ fontFamily: 'var(--font-display)' }}>
                  MyVinyl
                </span>
                <span className="app-brand__meta tabular-nums">
                  {recordCount} {countLabel}
                </span>
              </span>
            </a>

            <nav
              className="app-nav__links hidden items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] p-1 sm:flex"
              aria-label="Main"
            >
              {links.map(({ id, label, icon: Icon, href }) => {
                const active = page === id;
                return (
                  <a
                    key={id}
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(id);
                    }}
                    className="relative flex min-h-[2.75rem] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
                    style={{ color: active ? 'var(--text)' : 'var(--text-secondary)' }}
                    aria-current={active ? 'page' : undefined}
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
                  </a>
                );
              })}
            </nav>

            {searchSlot ? (
              <div className="app-nav__search min-w-0">
                <div className="app-nav__search-pill">{searchSlot}</div>
              </div>
            ) : null}

            <div className="app-nav__actions flex shrink-0 items-center sm:gap-3">
              <div className="hidden sm:inline-flex">
                <ThemeToggle />
              </div>
              <div className="sm:hidden">
                <ThemeToggle compact />
              </div>
              <button
                type="button"
                onClick={() => onScan?.()}
                className="nav-scan-btn"
                aria-label="Scan barcode"
                title="Scan barcode"
              >
                <Scan className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
              </button>
              <UserMenu />
              <button
                type="button"
                onClick={() => onAddRecord?.()}
                className="btn-primary app-nav__add-btn"
                aria-label="Search Discogs to add vinyl"
                title="Search Discogs to add vinyl"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2.25} />
                <span className="app-nav__add-label app-nav__add-label--short">Add</span>
                <span className="app-nav__add-label app-nav__add-label--full">Add vinyl</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="mobile-tab-bar no-print sm:hidden" aria-label="Main">
        {links.map(({ id, label, icon: Icon, href }) => {
          const active = page === id;
          return (
            <a
              key={id}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(id);
              }}
              className={`mobile-tab-bar__btn${active ? ' mobile-tab-bar__btn--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className="mobile-tab-bar__icon"
                strokeWidth={active ? 2.25 : 1.75}
                fill={id === 'play' && active ? 'currentColor' : 'none'}
              />
              <span className="mobile-tab-bar__label">{label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
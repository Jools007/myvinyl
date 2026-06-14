import { AnimatePresence, motion } from 'framer-motion';
import { Disc3, Import, Loader2, Plus, Search } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { searchDiscogs } from '../lib/api';
import { resolveDiscogsCoverUrl } from '../lib/discogsCover';
import { pickVinylFormatFromDiscogs } from '../lib/formats';
import type { DiscoverAddPayload } from '../lib/discoverAdd';
import type { DiscogsSearchHit } from '../lib/types';
import { DiscoverAddPanel } from './DiscoverAddPanel';

const TYPEAHEAD_LIMIT = 10;

export type DiscogsSearchBarHandle = {
  focus: () => void;
};

export interface DiscogsSearchBarProps {
  onAdd: (payload: DiscoverAddPayload) => void;
  collectionDiscogsIds?: number[];
  /** hero = on hero image; nav = app header; floating = fixed add-record bar; default = standalone */
  variant?: 'hero' | 'nav' | 'floating' | 'default';
  inputId?: string;
  onPanelOpenChange?: (open: boolean) => void;
  /** Hero only — opens bulk Discogs collection import */
  onDiscogsImport?: () => void;
}

export const DiscogsSearchBar = forwardRef<DiscogsSearchBarHandle, DiscogsSearchBarProps>(
  function DiscogsSearchBar(
    {
      onAdd,
      collectionDiscogsIds = [],
      variant = 'default',
      inputId = 'discogs-search-input',
      onPanelOpenChange,
      onDiscogsImport,
    },
    ref
  ) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DiscogsSearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [focused, setFocused] = useState(false);
    const [panelHit, setPanelHit] = useState<DiscogsSearchHit | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isMobile = useIsMobile();

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const inCollection = useMemo(
      () => new Set(collectionDiscogsIds),
      [collectionDiscogsIds]
    );

    useEffect(() => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setError('');
        return;
      }

      const timer = setTimeout(async () => {
        setLoading(true);
        setError('');
        try {
          const hits = await searchDiscogs(trimmed, TYPEAHEAD_LIMIT);
          setResults(hits.slice(0, TYPEAHEAD_LIMIT));
        } catch (e) {
          setResults([]);
          setError(e instanceof Error ? e.message : 'Search failed');
        } finally {
          setLoading(false);
        }
      }, 320);

      return () => clearTimeout(timer);
    }, [query]);

    const hasQuery = query.trim().length >= 2;
    const showDropdown = focused && hasQuery;
    const isHero = variant === 'hero';
    const isNav = variant === 'nav';
    const isFloating = variant === 'floating';
    const usePortal = isHero || isNav || isFloating;

    const updateDropdownPosition = useCallback(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const vv = window.visualViewport;
      const gap = isMobile ? 10 : -1;
      const top = rect.bottom + gap + (vv?.offsetTop ?? 0);
      const left = rect.left + (vv?.offsetLeft ?? 0);
      const width = Math.min(rect.width, vv?.width ?? rect.width);
      setDropdownPos({ top, left, width });
    }, [isMobile]);

    useLayoutEffect(() => {
      if (!showDropdown || !usePortal) return;
      updateDropdownPosition();
      const vv = window.visualViewport;
      window.addEventListener('resize', updateDropdownPosition);
      window.addEventListener('scroll', updateDropdownPosition, true);
      vv?.addEventListener('resize', updateDropdownPosition);
      vv?.addEventListener('scroll', updateDropdownPosition);
      return () => {
        window.removeEventListener('resize', updateDropdownPosition);
        window.removeEventListener('scroll', updateDropdownPosition, true);
        vv?.removeEventListener('resize', updateDropdownPosition);
        vv?.removeEventListener('scroll', updateDropdownPosition);
      };
    }, [showDropdown, usePortal, updateDropdownPosition]);

    const handleFocus = () => {
      setFocused(true);
      requestAnimationFrame(() => {
        updateDropdownPosition();
        inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    };

    const openPanel = (hit: DiscogsSearchHit) => {
      if (inCollection.has(hit.id)) return;
      setFocused(false);
      setPanelHit(hit);
      setPanelOpen(true);
      onPanelOpenChange?.(true);
    };

    const closePanel = () => {
      setPanelOpen(false);
      setPanelHit(null);
      onPanelOpenChange?.(false);
    };

    const selectHit = (hit: DiscogsSearchHit) => {
      if (inCollection.has(hit.id)) return;
      setQuery(`${hit.artist} — ${hit.title}`);
      openPanel(hit);
    };

    const dropdownContent = (
      <>
        {results.length > 0 && !loading && (
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-subtle)_60%,transparent)] px-4 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Discogs
            </span>
            <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">
              {results.length} shown
            </span>
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="flex items-center justify-center gap-2.5 px-4 py-8">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            <span className="text-xs tracking-wide text-[var(--text-muted)]">
              Searching Discogs…
            </span>
          </div>
        )}

        {error && !loading && (
          <p className="px-4 py-4 text-center text-xs text-amber-500">{error}</p>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Disc3 className="h-6 w-6 text-[var(--text-muted)]" strokeWidth={1.25} />
            <p className="text-xs text-[var(--text-secondary)]">No releases found</p>
            <p className="text-[10px] text-[var(--text-muted)]">
              Try another spelling or artist
            </p>
          </div>
        )}

        {results.length > 0 && (
          <ul
            className={`overflow-y-auto p-1.5 ${
              isMobile ? 'max-h-[min(14rem,38dvh)]' : 'max-h-[min(22rem,55vh)]'
            }`}
          >
            {results.map((hit) => {
              const cover =
                resolveDiscogsCoverUrl(hit.cover) ?? resolveDiscogsCoverUrl(hit.thumb);
              const owned = inCollection.has(hit.id);

              return (
                <li key={hit.id}>
                  <button
                    type="button"
                    disabled={owned}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectHit(hit)}
                    className="discover-typeahead-item group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-subtle)] shadow-sm ring-1 ring-[var(--border)] transition-shadow group-hover:ring-[var(--border-strong)] group-disabled:shadow-none">
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Disc3
                            className="h-5 w-5 text-[var(--text-muted)]"
                            strokeWidth={1.25}
                          />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[13px] font-semibold leading-snug tracking-tight text-[var(--text)]"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {hit.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                        {hit.artist}
                      </p>
                      {(hit.year || hit.format?.length) && (
                        <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                          {[
                            hit.year,
                            hit.format?.length
                              ? pickVinylFormatFromDiscogs(hit.format)
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>

                    {owned ? (
                      <span className="shrink-0 rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        In crate
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-medium uppercase tracking-wider text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
                        <Plus className="h-3 w-3" strokeWidth={2.5} />
                        Add
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );

    const dropdownPanel = (
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: isMobile ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isMobile ? 6 : -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={
              usePortal
                ? `discover-typeahead-portal${isMobile ? ' discover-typeahead-portal--mobile' : ''}`
                : `discover-typeahead absolute left-0 right-0 z-50 overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[var(--shadow-overlay)] ${
                    isMobile
                      ? 'top-[calc(100%+0.5rem)] rounded-2xl'
                      : 'top-[calc(100%-1px)] rounded-b-2xl border-t-0'
                  }`
            }
            style={
              usePortal
                ? {
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                  }
                : undefined
            }
          >
            {dropdownContent}
          </motion.div>
        )}
      </AnimatePresence>
    );

    return (
      <>
        <div
          ref={wrapRef}
          className={`discover-search-wrap relative text-left ${
            isHero
              ? 'collection-hero-search'
              : isNav
                ? 'app-nav-discogs-search'
                : isFloating
                  ? 'collection-discogs-floating-search'
                  : 'mx-auto max-w-2xl'
          }${showDropdown && isMobile ? ' discover-search-wrap--dropdown-open' : ''}`}
        >
          <Search
            className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)] ${
              isNav
                ? 'left-3 h-3.5 w-3.5 sm:left-3.5 sm:h-4 sm:w-4'
                : isHero || isFloating
                  ? 'left-3.5 h-4 w-4 sm:left-4'
                  : 'left-4 h-5 w-5 sm:left-5'
            }`}
            aria-hidden
          />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            className={`discover-search-input ${
              isHero ? 'discover-search-input--hero' : ''
            } ${isHero && onDiscogsImport ? 'discover-search-input--hero-import' : ''} ${
              isNav ? 'discover-search-input--nav' : ''
            } ${isNav && onDiscogsImport ? 'discover-search-input--nav-import' : ''} ${
              isFloating ? 'discover-search-input--floating' : ''
            } ${showDropdown && !isMobile ? 'rounded-b-xl' : ''}`}
            placeholder={
              isHero || isNav || isFloating
                ? 'Search Discogs to grow your crate…'
                : 'Search artist, album, or label…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleFocus}
            onBlur={() => setTimeout(() => setFocused(false), 180)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search Discogs to add records"
          />
          {(isHero || isNav) && onDiscogsImport ? (
            <span className="discogs-search-import">
              <button
                type="button"
                className="discogs-search-import__btn"
                onClick={onDiscogsImport}
                aria-label="Import from Discogs"
              >
                <Import className="h-4 w-4" strokeWidth={2.25} />
              </button>
              <span className="discogs-search-import__tooltip" role="tooltip">
                Import from Discogs
              </span>
            </span>
          ) : null}

          {loading && (
            <Loader2
              className={`absolute top-1/2 z-10 h-5 w-5 -translate-y-1/2 animate-spin text-[var(--accent)] ${
                (isHero || isNav) && onDiscogsImport
                  ? 'right-12 sm:right-[3.25rem]'
                  : 'right-4 sm:right-5'
              }`}
            />
          )}

          {!usePortal && dropdownPanel}
        </div>

        {usePortal && showDropdown
          ? createPortal(dropdownPanel, document.body)
          : null}

        <DiscoverAddPanel
          hit={panelHit}
          open={panelOpen}
          onClose={closePanel}
          onSave={(record, meta) => {
            onAdd({ record, ...meta });
            closePanel();
          }}
        />
      </>
    );
  }
);
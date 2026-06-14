import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  Disc3,
  BarChart3,
  FileDown,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  normalizeCondition,
  normalizeFormat,
  normalizeGenre,
  normalizeVibe,
  parseFilterList,
} from '../lib/filterLabels';
import { buildFormatFilterOptions, isCdFormat } from '../lib/formats';
import {
  CUT_RATINGS,
  cutRatingFilterLabel,
  type CutRatingFilter,
} from '../lib/cutRating';
import type { RecordCondition, ViewMode } from '../lib/types';
import { VIBE_TAG_SUGGESTIONS } from '../lib/vibes';

const CONDITIONS: RecordCondition[] = ['Mint', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];

const BPM_RANGES = [
  { id: 'all', label: 'Any BPM', min: undefined, max: undefined },
  { id: 'slow', label: '< 100', min: undefined, max: 99 },
  { id: 'mid', label: '100–120', min: 100, max: 120 },
  { id: 'dance', label: '120–130', min: 120, max: 130 },
  { id: 'fast', label: '130+', min: 130, max: undefined },
] as const;

export interface CollectionFilterState {
  query: string;
  format: string | null;
  genre: string | null;
  condition: RecordCondition | null;
  vibe: string | null;
  bpmRangeId: string;
  camelotKey: string | null;
  cutRating: CutRatingFilter | null;
}

export const DEFAULT_COLLECTION_FILTERS: CollectionFilterState = {
  query: '',
  format: null,
  genre: null,
  condition: null,
  vibe: null,
  bpmRangeId: 'all',
  camelotKey: null,
  cutRating: null,
};

interface CollectionFiltersProps {
  filters: CollectionFilterState;
  onChange: (patch: Partial<CollectionFilterState>) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  availableFormats: string[];
  availableGenres: string[];
  availableVibes: string[];
  onResetCollection?: () => void;
  onEnrichTracklists?: () => void;
  enrichingTracklists?: boolean;
  discogsLinkedCount?: number;
  onExportPdf?: () => void;
  exportingPdf?: boolean;
  onOpenInsights?: () => void;
  onEnrichMetadata?: () => void;
  enrichingMetadata?: boolean;
}

type FilterOption = { value: string; label: string };

function buildSelectOptions(
  placeholder: string,
  values: unknown[],
  normalize: (raw: unknown) => string,
): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [{ value: '', label: placeholder }];

  for (const raw of values) {
    for (const token of parseFilterList(raw)) {
      const label = normalize(token);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      options.push({ value: label, label });
    }
  }

  return options;
}

function FilterDropdown({
  id,
  label,
  value,
  options,
  onChange,
  active,
  openId,
  onOpenChange,
  formatLabel,
}: {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  active?: boolean;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  formatLabel: (raw: string) => string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const open = openId === id;
  const selected = options.find((o) => o.value === value) ?? options[0];
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: isMobile ? Math.max(rect.width, 168) : rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const isUnset =
    !value || value === '' || (id === 'bpm' && value === 'all');
  const mobileValue = isUnset ? 'Any' : formatLabel(selected.label);

  const menu = open ? (
    <ul
      ref={menuRef}
      role="listbox"
      aria-label={label}
      style={{
        position: 'fixed',
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 100,
      }}
      className="collection-filter-menu max-h-56 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-lg)] backdrop-blur-md"
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const optionLabel = formatLabel(opt.label);
        return (
          <li key={opt.value || '__all'} role="none">
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(opt.value);
                onOpenChange(null);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-colors sm:px-2 sm:py-1.5 sm:text-[11px] ${
                isSelected
                  ? 'bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
              }`}
            >
              <span className="min-w-0 flex-1 break-words">{optionLabel}</span>
              {isSelected ? <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="collection-filter-field relative min-w-0 sm:min-w-0 sm:flex-1 sm:basis-0 sm:max-w-[8.5rem]"
    >
      <span className="collection-filter-field__label sm:hidden">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(open ? null : id)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${mobileValue}`}
        className={`collection-filter-trigger flex w-full min-w-0 cursor-pointer items-center justify-between gap-1 rounded-lg border py-2 pl-2.5 pr-2 text-left transition-colors outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] sm:gap-1 sm:py-1.5 sm:pl-2.5 sm:pr-2 sm:text-[11px] ${
          active
            ? 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--accent-soft)] text-[var(--text)]'
            : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
        }`}
      >
        <span className="collection-filter-trigger__value min-w-0 flex-1 truncate text-[0.8125rem] font-medium leading-tight sm:text-[11px] sm:font-medium">
          <span className="sm:hidden">{mobileValue}</span>
          <span className="hidden truncate sm:inline">{formatLabel(selected.label)}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 sm:h-3 sm:w-3 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export function CollectionFilters({
  filters,
  onChange,
  onClear,
  resultCount,
  totalCount,
  viewMode,
  onViewModeChange,
  availableFormats,
  availableGenres,
  availableVibes,
  onResetCollection,
  onEnrichTracklists,
  enrichingTracklists = false,
  discogsLinkedCount = 0,
  onExportPdf,
  exportingPdf = false,
  onOpenInsights,
  onEnrichMetadata,
  enrichingMetadata = false,
}: CollectionFiltersProps) {
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLUListElement>(null);

  const hasActiveFilters =
    filters.query.trim() !== '' ||
    filters.format != null ||
    filters.genre != null ||
    filters.condition != null ||
    filters.vibe != null ||
    filters.bpmRangeId !== 'all' ||
    filters.camelotKey != null ||
    filters.cutRating != null;

  const activeFilterCount =
    (filters.query.trim() ? 1 : 0) +
    (filters.format ? 1 : 0) +
    (filters.genre ? 1 : 0) +
    (filters.condition ? 1 : 0) +
    (filters.vibe ? 1 : 0) +
    (filters.bpmRangeId !== 'all' ? 1 : 0) +
    (filters.camelotKey ? 1 : 0) +
    (filters.cutRating ? 1 : 0);

  const updateMoreMenuPosition = useCallback(() => {
    const trigger = moreTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 11.5 * 16;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8
    );
    setMoreMenuPos({
      top: rect.bottom + 4,
      left,
      width: menuWidth,
    });
  }, []);

  useLayoutEffect(() => {
    if (!moreOpen) return;
    updateMoreMenuPosition();
  }, [moreOpen, updateMoreMenuPosition]);

  useEffect(() => {
    if (!moreOpen) return;
    window.addEventListener('resize', updateMoreMenuPosition);
    window.addEventListener('scroll', updateMoreMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMoreMenuPosition);
      window.removeEventListener('scroll', updateMoreMenuPosition, true);
    };
  }, [moreOpen, updateMoreMenuPosition]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        moreRef.current?.contains(target) ||
        moreMenuRef.current?.contains(target)
      ) {
        return;
      }
      setMoreOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  const formatOptions = buildFormatFilterOptions(
    availableFormats.filter((f) => !isCdFormat(f))
  );
  const vibeOptions = [...new Set([...VIBE_TAG_SUGGESTIONS, ...availableVibes])];
  const genreOptions = availableGenres;

  const formatSelectOptions = buildSelectOptions('Format', formatOptions, normalizeFormat);
  const genreSelectOptions = buildSelectOptions('Genre', genreOptions, normalizeGenre);
  const conditionSelectOptions = buildSelectOptions('Condition', CONDITIONS, normalizeCondition);
  const vibeSelectOptions = buildSelectOptions('Vibe', vibeOptions, normalizeVibe);
  const bpmSelectOptions: FilterOption[] = BPM_RANGES.map((r) => ({
    value: r.id,
    label: r.id === 'all' ? 'BPM' : r.label,
  }));
  const cutRatingSelectOptions: FilterOption[] = [
    { value: '', label: 'Rating' },
    ...CUT_RATINGS.map((rating) => ({ value: rating, label: rating })),
    { value: 'rated', label: 'Any rated' },
    { value: 'unrated', label: 'Unrated' },
  ];

  const filterFields = (
    <>
      <FilterDropdown
        id="format"
        label="Format"
        value={filters.format ?? ''}
        options={formatSelectOptions}
        active={filters.format != null}
        openId={openFilterId}
        onOpenChange={setOpenFilterId}
        formatLabel={normalizeFormat}
        onChange={(v) => onChange({ format: v || null })}
      />
      <FilterDropdown
        id="genre"
        label="Genre"
        value={filters.genre ?? ''}
        options={genreSelectOptions}
        active={filters.genre != null}
        openId={openFilterId}
        onOpenChange={setOpenFilterId}
        formatLabel={normalizeGenre}
        onChange={(v) => onChange({ genre: v || null })}
      />
      <FilterDropdown
        id="condition"
        label="Condition"
        value={filters.condition ?? ''}
        options={conditionSelectOptions}
        active={filters.condition != null}
        openId={openFilterId}
        onOpenChange={setOpenFilterId}
        formatLabel={normalizeCondition}
        onChange={(v) => onChange({ condition: (v || null) as RecordCondition | null })}
      />
      <FilterDropdown
        id="vibe"
        label="Vibe"
        value={filters.vibe ?? ''}
        options={vibeSelectOptions}
        active={filters.vibe != null}
        openId={openFilterId}
        onOpenChange={setOpenFilterId}
        formatLabel={normalizeVibe}
        onChange={(v) => onChange({ vibe: v || null })}
      />
      <FilterDropdown
        id="bpm"
        label="BPM"
        value={filters.bpmRangeId}
        options={bpmSelectOptions}
        active={filters.bpmRangeId !== 'all'}
        openId={openFilterId}
        onOpenChange={setOpenFilterId}
        formatLabel={(label) => label}
        onChange={(v) => onChange({ bpmRangeId: v || 'all' })}
      />
      <FilterDropdown
        id="cutRating"
        label="Rating"
        value={filters.cutRating ?? ''}
        options={cutRatingSelectOptions}
        active={filters.cutRating != null}
        openId={openFilterId}
        onOpenChange={setOpenFilterId}
        formatLabel={(label) =>
          label === 'Rating' ? label : cutRatingFilterLabel(label as CutRatingFilter)
        }
        onChange={(v) =>
          onChange({
            cutRating: (v || null) as CutRatingFilter | null,
          })
        }
      />
    </>
  );

  return (
    <div className="collection-toolbar-sticky !pt-0 !pb-0">
      <div className="collection-toolbar relative overflow-visible bg-[var(--bg-elevated)]">
      <div className="collection-toolbar__search w-full bg-[var(--bg-elevated)] px-0 pt-0 sm:static sm:bg-transparent sm:px-3.5 sm:pt-2.5">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)] sm:left-3.5 sm:h-3.5 sm:w-3.5"
            aria-hidden
          />
          <input
            type="search"
            className="input-field collection-toolbar__search-input !w-full !py-0 !pl-10 !pr-9 text-[13px] leading-[1.25] placeholder:text-[color-mix(in_srgb,var(--text-muted)_50%,transparent)] sm:!h-9 sm:!pl-11 sm:!pr-10 sm:text-sm"
            placeholder="Search artist or title…"
            aria-label="Search your collection by artist or title"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => onChange({ query: '' })}
              className="collection-toolbar__clear-search absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="collection-toolbar__filters-row relative overflow-visible sm:flex sm:flex-nowrap sm:items-center sm:gap-2 sm:px-3.5 sm:py-2">
        <button
          type="button"
          className={`collection-toolbar__filters-toggle sm:hidden ${
            mobileFiltersOpen ? 'collection-toolbar__filters-toggle--open' : ''
          } ${hasActiveFilters ? 'collection-toolbar__filters-toggle--active' : ''}`}
          aria-expanded={mobileFiltersOpen}
          aria-controls="collection-toolbar-filters"
          onClick={() => {
            setMobileFiltersOpen((open) => {
              if (open) setOpenFilterId(null);
              return !open;
            });
          }}
        >
          <span className="collection-toolbar__filters-toggle-main">
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
            <span className="collection-toolbar__filters-toggle-label">Filters</span>
            {activeFilterCount > 0 ? (
              <span className="collection-toolbar__filters-toggle-count" aria-hidden>
                {activeFilterCount}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={`collection-toolbar__filters-toggle-chevron h-4 w-4 shrink-0 ${mobileFiltersOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>

        <div
          id="collection-toolbar-filters"
          className={`collection-toolbar__filters relative min-w-0 overflow-visible sm:flex sm:flex-1 sm:flex-nowrap sm:gap-1.5 ${
            mobileFiltersOpen ? 'collection-toolbar__filters--open' : 'collection-toolbar__filters--collapsed'
          }`}
        >
          {filterFields}
          {mobileFiltersOpen && hasActiveFilters ? (
            <div className="collection-toolbar__filters-panel-foot sm:hidden">
              <button
                type="button"
                onClick={onClear}
                className="collection-toolbar__filters-clear-all"
              >
                Clear all filters
              </button>
            </div>
          ) : null}
        </div>

        <div className="collection-toolbar__actions flex shrink-0 items-center gap-1 sm:ml-auto sm:gap-1.5">
          {filters.camelotKey ? (
            <button
              type="button"
              onClick={() => onChange({ camelotKey: null })}
              className="collection-toolbar__chip"
              title="Clear key filter"
            >
              <KeyRound className="h-3 w-3" aria-hidden />
              {filters.camelotKey}
              <X className="h-2.5 w-2.5 opacity-60" aria-hidden />
            </button>
          ) : null}

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClear}
              className="collection-toolbar__clear-btn hidden text-[10px] font-medium tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] sm:inline-flex sm:text-[10px]"
            >
              Clear
            </button>
          ) : null}

          <p className="collection-toolbar__count hidden text-xs tabular-nums text-[var(--text-muted)] sm:block">
            <span className="font-medium text-[var(--text-secondary)]">{resultCount}</span>
            <span className="text-[var(--text-muted)]">/{totalCount}</span>
          </p>

          <div
            className="collection-view-toggle flex rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-px"
            role="group"
            aria-label="Collection view"
          >
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={`collection-view-toggle__btn flex min-h-[1.75rem] min-w-[1.75rem] items-center justify-center rounded-[5px] p-1 transition-all ${
                viewMode === 'grid'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
              aria-pressed={viewMode === 'grid'}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={`collection-view-toggle__btn flex min-h-[1.75rem] min-w-[1.75rem] items-center justify-center rounded-[5px] p-1 transition-all ${
                viewMode === 'list'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
              aria-pressed={viewMode === 'list'}
              aria-label="List view"
              title="List view"
            >
              <List className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('shelf')}
              className={`collection-view-toggle__btn flex min-h-[1.75rem] min-w-[1.75rem] items-center justify-center rounded-[5px] p-1 transition-all ${
                viewMode === 'shelf'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
              aria-pressed={viewMode === 'shelf'}
              aria-label="Shelf view"
              title="Shelf view"
            >
              <Rows3 className="h-3 w-3" />
            </button>
          </div>

          <div ref={moreRef} className="collection-toolbar__more relative">
            <button
              ref={moreTriggerRef}
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="collection-toolbar__more-btn"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="More actions"
              title="More actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
            {moreOpen
              ? createPortal(
                  <ul
                    ref={moreMenuRef}
                    className="collection-toolbar__more-menu collection-toolbar__more-menu--portal"
                    role="menu"
                    style={{
                      position: 'fixed',
                      top: moreMenuPos.top,
                      left: moreMenuPos.left,
                      width: moreMenuPos.width,
                      zIndex: 120,
                    }}
                  >
                {totalCount > 0 && onOpenInsights ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="collection-toolbar__more-item"
                      onClick={() => {
                        setMoreOpen(false);
                        onOpenInsights();
                      }}
                    >
                      <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                      Insights
                    </button>
                  </li>
                ) : null}
                {resultCount > 0 && onExportPdf ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="collection-toolbar__more-item"
                      disabled={exportingPdf}
                      onClick={() => {
                        setMoreOpen(false);
                        onExportPdf();
                      }}
                    >
                      {exportingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Export PDF
                    </button>
                  </li>
                ) : null}
                {totalCount > 0 && onEnrichMetadata ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="collection-toolbar__more-item"
                      disabled={enrichingMetadata}
                      onClick={() => {
                        setMoreOpen(false);
                        onEnrichMetadata();
                      }}
                    >
                      {enrichingMetadata ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <KeyRound className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Enrich metadata
                    </button>
                  </li>
                ) : null}
                {discogsLinkedCount > 0 && onEnrichTracklists ? (
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="collection-toolbar__more-item"
                      disabled={enrichingTracklists}
                      onClick={() => {
                        setMoreOpen(false);
                        onEnrichTracklists();
                      }}
                    >
                      {enrichingTracklists ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Disc3 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Enrich tracklists
                    </button>
                  </li>
                ) : null}
                {totalCount > 0 && onResetCollection ? (
                  <li role="none" className="collection-toolbar__more-divider">
                    <button
                      type="button"
                      role="menuitem"
                      className="collection-toolbar__more-item collection-toolbar__more-item--danger"
                      onClick={() => {
                        setMoreOpen(false);
                        onResetCollection();
                      }}
                    >
                      Reset collection
                    </button>
                  </li>
                ) : null}
                  </ul>,
                  document.body
                )
              : null}
          </div>
        </div>
      </div>

      <div className="collection-toolbar__mobile-meta sm:hidden">
        <p className="collection-toolbar__mobile-count tabular-nums">
          <span className="font-medium text-[var(--text-secondary)]">{resultCount}</span>
          <span className="text-[var(--text-muted)]"> of {totalCount} records</span>
        </p>
        {hasActiveFilters && !mobileFiltersOpen ? (
          <button type="button" onClick={onClear} className="collection-toolbar__mobile-clear">
            Clear
          </button>
        ) : null}
      </div>
      </div>
    </div>
  );
}

export function bpmRangeFromId(id: string): { min?: number; max?: number } {
  const r = BPM_RANGES.find((x) => x.id === id);
  if (!r || id === 'all') return {};
  return { min: r.min, max: r.max };
}

export function recordMatchesBpm(bpm: number | undefined, rangeId: string): boolean {
  if (rangeId === 'all') return true;
  if (bpm == null) return false;
  const { min, max } = bpmRangeFromId(rangeId);
  if (min != null && bpm < min) return false;
  if (max != null && bpm > max) return false;
  return true;
}
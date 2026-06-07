import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LayoutGrid, Rows3, Search, X } from 'lucide-react';
import { buildFormatFilterOptions, isCdFormat } from '../lib/formats';
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
}

export const DEFAULT_COLLECTION_FILTERS: CollectionFilterState = {
  query: '',
  format: null,
  genre: null,
  condition: null,
  vibe: null,
  bpmRangeId: 'all',
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
}

type FilterOption = { value: string; label: string };

function FilterDropdown({
  id,
  label,
  value,
  options,
  onChange,
  active,
  openId,
  onOpenChange,
}: {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  active?: boolean;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
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
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
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
      className="max-h-52 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-lg)] backdrop-blur-md"
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
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
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                isSelected
                  ? 'bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {isSelected ? <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div ref={rootRef} className="relative sm:min-w-0 sm:flex-1 sm:basis-0 sm:max-w-[8.5rem]">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(open ? null : id)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`flex w-full cursor-pointer items-center justify-between gap-1 rounded-lg border py-2 pl-3 pr-2 text-left text-xs font-medium tracking-wide transition-colors outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] sm:py-1.5 sm:pl-2.5 sm:text-[11px] ${
          active
            ? 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--accent-soft)] text-[var(--text)]'
            : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
        }`}
      >
        <span className="sm:truncate">{selected.label}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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
}: CollectionFiltersProps) {
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  const hasActiveFilters =
    filters.query.trim() !== '' ||
    filters.format != null ||
    filters.genre != null ||
    filters.condition != null ||
    filters.vibe != null ||
    filters.bpmRangeId !== 'all';

  const formatOptions = buildFormatFilterOptions(
    availableFormats.filter((f) => !isCdFormat(f))
  );
  const vibeOptions = [...new Set([...VIBE_TAG_SUGGESTIONS, ...availableVibes])];
  const genreOptions = availableGenres;

  const formatSelectOptions: FilterOption[] = [
    { value: '', label: 'Format' },
    ...formatOptions.map((f) => ({ value: f, label: f })),
  ];
  const genreSelectOptions: FilterOption[] = [
    { value: '', label: 'Genre' },
    ...genreOptions.map((g) => ({ value: g, label: g })),
  ];
  const conditionSelectOptions: FilterOption[] = [
    { value: '', label: 'Condition' },
    ...CONDITIONS.map((c) => ({ value: c, label: c })),
  ];
  const vibeSelectOptions: FilterOption[] = [
    { value: '', label: 'Vibe' },
    ...vibeOptions.map((v) => ({ value: v, label: v })),
  ];
  const bpmSelectOptions: FilterOption[] = BPM_RANGES.map((r) => ({
    value: r.id,
    label: r.id === 'all' ? 'BPM' : r.label,
  }));

  return (
    <div className="collection-toolbar-sticky static sm:sticky -mt-2 !pt-0 pb-0.5 sm:mt-0 sm:pt-1 sm:pb-2">
      <div className="collection-toolbar relative z-30 overflow-visible sm:rounded-xl sm:border sm:border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
      <div className="px-0 pt-0 sm:pt-2.5 sm:px-3.5 sticky top-[6.25rem] w-full bg-[#111] z-[60] sm:static sm:top-[var(--nav-height)] sm:bg-transparent sm:z-auto">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            className="input-field !h-9 !w-full !py-0 !pl-11 !pr-10 text-sm leading-[1.25] placeholder:text-[color-mix(in_srgb,var(--text-muted)_50%,transparent)]"
            placeholder="Search artist or title…"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => onChange({ query: '' })}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-1 overflow-visible px-2 py-0 sm:flex-nowrap sm:gap-2 sm:px-3.5 sm:py-2">
        <div className="relative flex flex-wrap min-w-0 flex-1 basis-full gap-2 overflow-visible sm:flex-nowrap sm:gap-1.5 sm:basis-auto">
          <FilterDropdown
            id="format"
            label="Format"
            value={filters.format ?? ''}
            options={formatSelectOptions}
            active={filters.format != null}
            openId={openFilterId}
            onOpenChange={setOpenFilterId}
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
            onChange={(v) => onChange({ bpmRangeId: v || 'all' })}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] sm:text-[10px]"
            >
              Clear
            </button>
          ) : null}

          <p className="hidden text-xs tabular-nums text-[var(--text-muted)] sm:block sm:text-[10px]">
            <span className="font-medium text-[var(--text-secondary)]">{resultCount}</span>
            <span className="text-[var(--text-muted)]"> / {totalCount}</span>
          </p>

          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all sm:px-2 sm:py-1 sm:text-[10px] ${
                viewMode === 'grid'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid className="h-3 w-3" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('shelf')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all sm:px-2 sm:py-1 sm:text-[10px] ${
                viewMode === 'shelf'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
              aria-pressed={viewMode === 'shelf'}
            >
              <Rows3 className="h-3 w-3" />
              <span className="hidden sm:inline">Shelf</span>
            </button>
          </div>

          {totalCount > 0 && onResetCollection ? (
            <button
              type="button"
              onClick={onResetCollection}
              className="collection-toolbar__reset-btn"
            >
              Reset collection
            </button>
          ) : null}
        </div>
      </div>

      <p className="border-t border-[var(--border)] px-2 py-1 text-center text-[10px] tabular-nums text-[var(--text-muted)] sm:hidden">
        <span className="font-medium text-[var(--text-secondary)]">{resultCount}</span>
        {' of '}
        {totalCount} records
      </p>
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
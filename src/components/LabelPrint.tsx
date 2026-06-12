import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Check,
  CheckSquare,
  ChevronRight,
  GripVertical,
  Printer,
  Search,
  Square,
  X,
} from 'lucide-react';
import { resolveTrackCamelot } from '../lib/camelot';
import { getPrimaryTrack } from '../lib/types';
import type { LabelDisplayPrefs, VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';
import { CrateLabel } from './labels/CrateLabel';
import { LabelInspectModal } from './labels/LabelInspectModal';

interface LabelPrintProps {
  records: VinylRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSaveDescription: (recordId: string, notes: string) => void;
  onSaveVibes: (recordId: string, vibeTags: string[]) => void;
  onSaveLabelDisplay: (recordId: string, display: LabelDisplayPrefs) => void;
  onEnrichRelease?: (recordId: string) => Promise<void>;
  enrichingRecordId?: string | null;
}

const SPLIT_MIN = 28;
const SPLIT_MAX = 58;
const SPLIT_DEFAULT = 40;

function matchesSearch(record: VinylRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${record.artist} ${record.title} ${record.format ?? ''} ${record.genres.join(' ')}`.toLowerCase();
  return hay.includes(q);
}

export function LabelPrint({
  records,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearSelection,
  onSaveDescription,
  onSaveVibes,
  onSaveLabelDisplay,
  onEnrichRelease,
  enrichingRecordId = null,
}: LabelPrintProps) {
  const [search, setSearch] = useState('');
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [splitPct, setSplitPct] = useState(SPLIT_DEFAULT);
  const [labelOrder, setLabelOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const splitShellRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startY: number; startPct: number } | null>(null);

  const filtered = useMemo(
    () => records.filter((r) => matchesSearch(r, search)),
    [records, search]
  );

  useEffect(() => {
    setLabelOrder((prev) => {
      const next = prev.filter((id) => selectedIds.has(id));
      for (const id of selectedIds) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  }, [selectedIds]);

  const recordById = useMemo(
    () => new Map(records.map((r) => [r.id, r])),
    [records]
  );

  const selected = useMemo(
    () =>
      labelOrder
        .map((id) => recordById.get(id))
        .filter((r): r is VinylRecord => r != null),
    [labelOrder, recordById]
  );

  const inspectRecord = inspectId
    ? records.find((r) => r.id === inspectId) ?? null
    : null;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const handlePrint = () => {
    window.print();
  };

  const openInspect = useCallback((recordId: string) => {
    setInspectId(recordId);
  }, []);

  const selectFiltered = () => {
    for (const r of filtered) {
      if (!selectedIds.has(r.id)) onToggle(r.id);
    }
  };

  const deselectFiltered = () => {
    for (const r of filtered) {
      if (selectedIds.has(r.id)) onToggle(r.id);
    }
  };

  const moveLabel = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setLabelOrder((prev) => {
      const fromIdx = prev.indexOf(fromId);
      const toIdx = prev.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    });
  }, []);

  const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStateRef.current = { startY: e.clientY, startPct: splitPct };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const shell = splitShellRef.current;
    if (!drag || !shell) return;
    const shellH = shell.getBoundingClientRect().height;
    if (shellH <= 0) return;
    const deltaPct = ((e.clientY - drag.startY) / shellH) * 100;
    const next = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, drag.startPct + deltaPct));
    setSplitPct(next);
  };

  const onSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const pickerList = (
    <ul className="labels-picker__list">
      {filtered.length === 0 ? (
        <li className="labels-picker__empty">No records match your search.</li>
      ) : (
        filtered.map((record) => {
          const checked = selectedIds.has(record.id);
          const track = getPrimaryTrack(record);
          const { code } = resolveTrackCamelot(track);

          return (
            <li
              key={record.id}
              className={`labels-picker__item${checked ? ' labels-picker__item--on' : ''}`}
            >
              <button
                type="button"
                className="labels-picker__select"
                onClick={() => onToggle(record.id)}
                aria-pressed={checked}
                aria-label={
                  checked
                    ? `Deselect ${record.artist}, ${record.title}`
                    : `Select ${record.artist}, ${record.title}`
                }
              >
                <span
                  className={`labels-picker__check${checked ? ' labels-picker__check--on' : ''}`}
                  aria-hidden
                >
                  {checked ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                </span>
              </button>
              <button
                type="button"
                className="labels-picker__row"
                onClick={() => openInspect(record.id)}
                aria-label={`Preview and edit label for ${record.artist}, ${record.title}`}
              >
                <RecordArtwork
                  src={record.coverUrl}
                  title={record.title}
                  size="sm"
                  className="labels-picker__art shrink-0"
                />
                <span className="labels-picker__text">
                  <span className="labels-picker__artist">{record.artist}</span>
                  <span className="labels-picker__album">{record.title}</span>
                  <span className="labels-picker__mix">
                    <span className="tabular-nums">
                      {track?.bpm != null ? (
                        <>
                          {track.bpmEstimated ? '~' : null}
                          {track.bpm} BPM
                        </>
                      ) : (
                        '— BPM'
                      )}
                    </span>
                    <span className="labels-picker__mix-dot" aria-hidden>
                      ·
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {code ?? '—'}
                    </span>
                  </span>
                </span>
                <span className="labels-picker__inspect" aria-hidden>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  const pickerToolbar = (
    <>
      <div className="labels-picker__toolbar">
        <div className="labels-picker__search-wrap">
          <Search
            className="labels-picker__search-icon h-4 w-4"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artist or album…"
            className="labels-picker__search"
            aria-label="Search collection"
          />
          {search ? (
            <button
              type="button"
              className="labels-picker__search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="labels-picker__bulk">
          <button
            type="button"
            className="labels-picker__bulk-btn"
            onClick={allFilteredSelected ? deselectFiltered : selectFiltered}
            disabled={!filtered.length}
          >
            {allFilteredSelected ? (
              <CheckSquare className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Square className="h-4 w-4" strokeWidth={2} />
            )}
            {allFilteredSelected ? 'Deselect shown' : 'Select shown'}
          </button>
          <button type="button" className="labels-picker__bulk-btn" onClick={onSelectAll}>
            <Check className="h-4 w-4" strokeWidth={2} />
            All {records.length}
          </button>
          {selectedIds.size > 0 ? (
            <button type="button" className="labels-picker__bulk-btn" onClick={onClearSelection}>
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <p className="labels-picker__count">
        <span className="labels-picker__count-strong">{selectedIds.size}</span> selected
        {search ? (
          <>
            {' '}
            · {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </>
        ) : (
          <> · {records.length} in collection</>
        )}
      </p>
    </>
  );

  const previewContent =
    selected.length === 0 ? (
      <div className="labels-workspace__empty">
        <p>Select records above to preview printable labels.</p>
        <p className="labels-workspace__empty-sub">
          Each sticker is 2.125″ square — sized for standard DJ sleeve dots.
        </p>
      </div>
    ) : (
      <div className="labels-workspace__stage">
        <div className="labels-workspace__grid">
          {selected.map((record) => (
            <div
              key={record.id}
              className={`labels-workspace__item${dragId === record.id ? ' labels-workspace__item--drag' : ''}`}
              draggable
              onDragStart={() => setDragId(record.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) moveLabel(dragId, record.id);
                setDragId(null);
              }}
            >
              <span className="labels-workspace__drag" aria-hidden>
                <GripVertical className="h-4 w-4" strokeWidth={2} />
              </span>
              <CrateLabel
                record={record}
                size="preview"
                onClick={() => setInspectId(record.id)}
              />
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="labels-page">
      <header className="labels-page__head">
        <div>
          <h1 className="labels-page__title" style={{ fontFamily: 'var(--font-display)' }}>
            Crate labels
          </h1>
          <p className="labels-page__sub">
            Print square stickers for your sleeves — BPM, key, and vibes at a glance in the crate.
          </p>
        </div>
        <div className="labels-page__actions labels-page__actions--desktop no-print">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!selected.length}
            className="btn-primary disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            Print {selected.length > 0 ? selected.length : ''} label
            {selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </header>

      <div
        ref={splitShellRef}
        className="labels-page__layout labels-page__layout--split no-print"
        style={{ '--labels-split': `${splitPct}%` } as CSSProperties}
      >
        <section className="labels-picker" aria-label="Select records for labels">
          {pickerToolbar}
          {pickerList}
        </section>

        <div
          className="labels-page__splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(splitPct)}
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          aria-label="Resize picker and preview"
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onPointerUp={onSplitPointerUp}
          onPointerCancel={onSplitPointerUp}
        >
          <span className="labels-page__splitter-grip" aria-hidden />
        </div>

        <section className="labels-workspace" aria-label="Label print preview">
          <div className="labels-workspace__head">
            <h2 className="labels-workspace__title">Print preview</h2>
            <p className="labels-workspace__hint">
              Tap a record or label to edit · drag to reorder
            </p>
          </div>
          {previewContent}
        </section>
      </div>

      <footer className="labels-page__print-bar no-print" aria-label="Print actions">
        <p className="labels-page__print-meta">
          <span className="labels-page__print-count">{selected.length}</span>
          {selected.length === 1 ? ' label' : ' labels'} ready
        </p>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!selected.length}
          className="labels-page__print-btn btn-primary disabled:opacity-40"
        >
          <Printer className="h-5 w-5" strokeWidth={2} />
          Print {selected.length > 0 ? selected.length : ''} label
          {selected.length === 1 ? '' : 's'}
        </button>
      </footer>

      <LabelInspectModal
        record={inspectRecord}
        onClose={() => setInspectId(null)}
        onSaveDescription={onSaveDescription}
        onSaveVibes={onSaveVibes}
        onSaveLabelDisplay={onSaveLabelDisplay}
        onEnrich={onEnrichRelease}
        enriching={Boolean(inspectId && enrichingRecordId === inspectId)}
        onPrint={selected.length > 0 ? handlePrint : undefined}
        printCount={selected.length}
      />

      <div className="labels-print-only" aria-hidden>
        <div className="labels-print-sheet">
          {selected.map((record) => (
            <CrateLabel key={record.id} record={record} size="print" />
          ))}
        </div>
      </div>
    </div>
  );
}
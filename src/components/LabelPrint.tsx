import { useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Printer,
  Search,
  Square,
  X,
} from 'lucide-react';
import { resolveTrackCamelot } from '../lib/camelot';
import { getPrimaryTrack } from '../lib/types';
import type { VinylRecord } from '../lib/types';
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
}

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
}: LabelPrintProps) {
  const [search, setSearch] = useState('');
  const [inspectId, setInspectId] = useState<string | null>(null);

  const filtered = useMemo(
    () => records.filter((r) => matchesSearch(r, search)),
    [records, search]
  );

  const selected = useMemo(
    () => records.filter((r) => selectedIds.has(r.id)),
    [records, selectedIds]
  );

  const inspectRecord = inspectId
    ? records.find((r) => r.id === inspectId) ?? null
    : null;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const handlePrint = () => {
    window.print();
  };

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
        <div className="labels-page__actions no-print">
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

      <div className="labels-page__layout no-print">
        <section className="labels-picker" aria-label="Select records for labels">
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

          <ul className="labels-picker__list">
            {filtered.length === 0 ? (
              <li className="labels-picker__empty">No records match your search.</li>
            ) : (
              filtered.map((record) => {
                const checked = selectedIds.has(record.id);
                const track = getPrimaryTrack(record);
                const { code } = resolveTrackCamelot(track);

                return (
                  <li key={record.id}>
                    <button
                      type="button"
                      className={`labels-picker__row${checked ? ' labels-picker__row--on' : ''}`}
                      onClick={() => onToggle(record.id)}
                      aria-pressed={checked}
                    >
                      <span
                        className={`labels-picker__check${checked ? ' labels-picker__check--on' : ''}`}
                        aria-hidden
                      >
                        {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </span>
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
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="labels-workspace" aria-label="Label print preview">
          <div className="labels-workspace__head">
            <h2 className="labels-workspace__title">Print preview</h2>
            <p className="labels-workspace__hint">Click a label to inspect at full size</p>
          </div>

          {selected.length === 0 ? (
            <div className="labels-workspace__empty">
              <p>Select records on the left to preview printable labels.</p>
              <p className="labels-workspace__empty-sub">
                Each sticker is 2.125″ square — sized for standard DJ sleeve dots.
              </p>
            </div>
          ) : (
            <div className="labels-workspace__grid">
              {selected.map((record) => (
                <CrateLabel
                  key={record.id}
                  record={record}
                  size="preview"
                  onClick={() => setInspectId(record.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <LabelInspectModal
        record={inspectRecord}
        onClose={() => setInspectId(null)}
        onSaveDescription={onSaveDescription}
        onSaveVibes={onSaveVibes}
        onPrint={selected.length > 0 ? handlePrint : undefined}
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
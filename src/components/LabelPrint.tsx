import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Bluetooth,
  Check,
  CheckSquare,
  ChevronRight,
  GripVertical,
  Loader2,
  Printer,
  Search,
  Square,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePhomemoPrinter } from '../hooks/usePhomemoPrinter';
import { resolveTrackCamelot } from '../lib/camelot';
import {
  LABEL_PRINT_PROFILES,
  loadLabelPrintProfile,
  saveLabelPrintProfile,
  type LabelPrintProfileId,
} from '../lib/labelProfiles';

import { getPrimaryTrack } from '../lib/types';
import type { LabelDisplayPrefs, VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';
import { CrateLabel } from './labels/CrateLabel';
import { ThermalLabelPreview } from './labels/ThermalLabelPreview';
import { ThermalLabelQcError } from '../lib/labels/qc';
import { LabelInspectModal } from './labels/LabelInspectModal';

interface LabelPrintProps {
  records: VinylRecord[];
  crateName?: string;
  isGuestCrate?: boolean;
  readOnly?: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSaveDescription?: (recordId: string, notes: string) => void;
  onSaveVibes?: (recordId: string, vibeTags: string[]) => void;
  onSaveLabelDisplay?: (recordId: string, display: LabelDisplayPrefs) => void;
  onEnrichRelease?: (recordId: string) => Promise<void>;
  enrichingRecordId?: string | null;
}

const SPLIT_MIN = 28;
const SPLIT_MAX = 58;
const SPLIT_DEFAULT = 40;
/** Picker share on mobile — lower leaves more room for the thermal preview pane. */
const SPLIT_THERMAL_MAX = 38;

function matchesSearch(record: VinylRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${record.artist} ${record.title} ${record.format ?? ''} ${record.genres.join(' ')}`.toLowerCase();
  return hay.includes(q);
}

export function LabelPrint({
  records,
  crateName,
  isGuestCrate = false,
  readOnly = false,
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
  const [printProfile, setPrintProfile] = useState<LabelPrintProfileId>(loadLabelPrintProfile);
  const phomemo = usePhomemoPrinter();
  const splitShellRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startY: number; startPct: number } | null>(null);
  const activeProfile =
    LABEL_PRINT_PROFILES.find((p) => p.id === printProfile) ?? LABEL_PRINT_PROFILES[0];
  const isThermalProfile = activeProfile.thermal;

  useEffect(() => {
    if (isThermalProfile) {
      setSplitPct((prev) => Math.min(prev, SPLIT_THERMAL_MAX));
    }
  }, [isThermalProfile]);

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
    if (isThermalProfile) {
      void handleThermalPrint();
      return;
    }
    window.print();
  };

  const handleProfileChange = (id: LabelPrintProfileId) => {
    setPrintProfile(id);
    saveLabelPrintProfile(id);
  };

  const handleConnectPrinter = async (event?: { shiftKey?: boolean }) => {
    try {
      if (phomemo.connected) {
        await phomemo.disconnect();
        toast.message('Printer disconnected');
        return;
      }
      const showAllDevices = event?.shiftKey === true;
      await phomemo.connect({ showAllDevices });
      toast.success('Printer connected', { description: phomemo.deviceName ?? 'Phomemo M220' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect to printer';
      toast.error('Printer connection failed', {
        description: `${message} · Hold Shift and click Connect to show all Bluetooth devices.`,
      });
    }
  };

  const handleThermalPrint = async () => {
    if (selected.length === 0) return;
    if (printProfile === 'phomemo-40x80') {
      toast.message('40×80 mm coming soon', { description: 'Use 40×30 mm for your first test batch.' });
      return;
    }
    try {
      await phomemo.printRecords(selected, printProfile);
      toast.success(
        selected.length === 1 ? 'Label sent to M220' : `${selected.length} labels sent to M220`
      );
    } catch (err) {
      if (err instanceof ThermalLabelQcError) {
        const failed = err.report.checks.filter((c) => !c.pass);
        toast.error('Label failed quality check', {
          description: failed.map((c) => c.message).join(' · '),
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Print failed';
      toast.error('Thermal print failed', { description: message });
    }
  };

  const handleThermalCalibration = async () => {
    try {
      await phomemo.printCalibrationLabel(printProfile);
      toast.success('Calibration label sent', {
        description: 'Check border position and smallest legible font size on the sticker.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Print failed';
      toast.error('Calibration print failed', { description: message });
    }
  };

  const handleThermalTest = async () => {
    const sample = selected[0] ?? records[0] ?? null;
    if (!sample) {
      toast.message('No records available', { description: 'Add a record to print a test label.' });
      return;
    }
    try {
      await phomemo.printTestLabel(sample, printProfile);
      toast.success('Test label sent', { description: `${sample.artist} — ${sample.title}` });
    } catch (err) {
      if (err instanceof ThermalLabelQcError) {
        const failed = err.report.checks.filter((c) => !c.pass);
        toast.error('Test label failed quality check', {
          description: failed.map((c) => c.message).join(' · '),
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Print failed';
      toast.error('Test print failed', { description: message });
    }
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
          {isThermalProfile
            ? `${activeProfile.widthMm}×${activeProfile.heightMm} mm thermal labels for your M220.`
            : 'Each sticker is 2.125″ square — sized for standard DJ sleeve dots.'}
        </p>
      </div>
    ) : isThermalProfile ? (
      <div className="labels-workspace__stage labels-workspace__stage--thermal">
        <div className="labels-thermal-preview">
          <div className="labels-thermal-preview__slot">
            <ThermalLabelPreview
              record={selected[0]}
              widthMm={activeProfile.widthMm}
              heightMm={activeProfile.heightMm}
              onClick={() => openInspect(selected[0].id)}
            />
          </div>
          <p className="labels-thermal-preview__note">
            {activeProfile.widthMm}×{activeProfile.heightMm} mm · {selected.length} label
            {selected.length === 1 ? '' : 's'} in queue
          </p>
        </div>
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
          <p className="labels-page__kicker">
            {isGuestCrate ? 'Guest crate labels' : 'Crate labels'}
          </p>
          <h1 className="labels-page__title" style={{ fontFamily: 'var(--font-display)' }}>
            {crateName ? `${crateName} labels` : 'Crate labels'}
          </h1>
          <p className="labels-page__sub">
            {readOnly
              ? 'Preview and print labels from this guest crate — edits stay in your personal crate only.'
              : 'Print square stickers for your sleeves — BPM, key, and vibes at a glance in the crate.'}
          </p>
        </div>
        <div className="labels-page__actions labels-page__actions--desktop no-print">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!selected.length || phomemo.printing}
            className="btn-primary disabled:opacity-40"
          >
            {phomemo.printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            {isThermalProfile ? 'Print to M220' : 'Print'}{' '}
            {selected.length > 0 ? selected.length : ''} label
            {selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </header>

      <section className="labels-thermal-bar no-print" aria-label="Printer setup">
        <div className="labels-thermal-bar__row">
          <label className="labels-thermal-bar__field">
            <span className="labels-thermal-bar__label">Label size</span>
            <select
              className="labels-thermal-bar__select"
              value={printProfile}
              onChange={(e) => handleProfileChange(e.target.value as LabelPrintProfileId)}
            >
              {LABEL_PRINT_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <p className="labels-thermal-bar__hint">{activeProfile.description}</p>
        </div>

        {isThermalProfile ? (
          <div className="labels-thermal-bar__row labels-thermal-bar__row--actions">
            {!phomemo.supported ? (
              <p className="labels-thermal-bar__warn">
                Thermal printing needs Chrome or Edge with Web Bluetooth enabled.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className={`labels-thermal-bar__btn${phomemo.connected ? ' labels-thermal-bar__btn--on' : ''}`}
                  onClick={(e) => void handleConnectPrinter(e)}
                  disabled={phomemo.printing || phomemo.connecting}
                >
                  {phomemo.connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <Bluetooth className="h-4 w-4" strokeWidth={2} />
                  )}
                  {phomemo.connecting
                    ? 'Connecting…'
                    : phomemo.connected
                      ? `Connected · ${phomemo.deviceName ?? 'M220'}`
                      : 'Connect M220'}
                </button>
                <button
                  type="button"
                  className="labels-thermal-bar__btn labels-thermal-bar__btn--ghost"
                  onClick={() => void handleThermalTest()}
                  disabled={phomemo.printing}
                >
                  Print test label
                </button>
                <button
                  type="button"
                  className="labels-thermal-bar__btn labels-thermal-bar__btn--ghost"
                  onClick={() => void handleThermalCalibration()}
                  disabled={phomemo.printing}
                >
                  Print calibration
                </button>
                {phomemo.progress ? (
                  <p className="labels-thermal-bar__progress">
                    Printing {phomemo.progress.current} of {phomemo.progress.total}…
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </section>

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
          <div
            className={`labels-workspace__head${isThermalProfile ? ' labels-workspace__head--thermal' : ''}`}
          >
            <h2 className="labels-workspace__title">Print preview</h2>
            <p className="labels-workspace__hint">
              {isThermalProfile
                ? `${activeProfile.widthMm}×${activeProfile.heightMm} mm thermal preview · tap to edit`
                : 'Tap a record or label to edit · drag to reorder'}
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
          disabled={!selected.length || phomemo.printing}
          className="labels-page__print-btn btn-primary disabled:opacity-40"
        >
          {phomemo.printing ? (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
          ) : (
            <Printer className="h-5 w-5" strokeWidth={2} />
          )}
          {isThermalProfile ? 'Print to M220' : 'Print'}{' '}
          {selected.length > 0 ? selected.length : ''} label
          {selected.length === 1 ? '' : 's'}
        </button>
      </footer>

      <LabelInspectModal
        record={inspectRecord}
        onClose={() => setInspectId(null)}
        readOnly={readOnly}
        thermalLabel={
          isThermalProfile
            ? { widthMm: activeProfile.widthMm, heightMm: activeProfile.heightMm }
            : null
        }
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
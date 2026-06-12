import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronRight, Disc3, ListPlus, Loader2, Pencil, Play, Sparkles, Trash2 } from 'lucide-react';
import { resolveDiscogsCoverUrl } from '../lib/discogsCover';
import { resolveTrackCamelot } from '../lib/camelot';
import { getPrimaryTrack, isReleaseFullyEnriched } from '../lib/tracks';
import type { LiveEnrichState } from '../hooks/useCollection';
import { openRecordDetail } from '../lib/recordDetail';
import type { Track, VinylRecord } from '../lib/types';
import { RecordArtworkButton } from './RecordArtworkButton';

interface CollectionListViewProps {
  records: VinylRecord[];
  liveEnrich?: LiveEnrichState;
  onPlayNow: (record: VinylRecord, track: Track) => void;
  onAddToQueue: (record: VinylRecord, track: Track) => void;
  onDelete: (id: string) => void;
  onEnrichRelease: (recordId: string) => Promise<void>;
}

const headerLabelClass =
  'text-[8px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]';

function ListTag({
  children,
  variant = 'default',
  compact = false,
}: {
  children: ReactNode;
  variant?: 'default' | 'accent' | 'violet';
  compact?: boolean;
}) {
  const styles = {
    default: 'bg-[var(--bg-subtle)] text-[var(--text-muted)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    violet: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  };
  return (
    <span
      className={`inline-flex max-w-full shrink-0 truncate rounded px-1.5 py-0.5 text-[9px] font-medium leading-none sm:rounded-md sm:px-1.5 sm:py-px sm:text-[8px] ${
        compact ? 'collection-list-tag--compact rounded-[5px] px-1 py-px text-[8px]' : 'rounded-md'
      } ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function MetaCell({
  label,
  children,
  className = '',
  mixCol = false,
  vibeCol = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mixCol?: boolean;
  vibeCol?: boolean;
}) {
  const colClass = mixCol
    ? 'collection-list-mix-col'
    : vibeCol
      ? 'collection-list-vibe-col'
      : label === 'Format'
        ? 'collection-list-format-col'
        : '';
  return (
    <div className={`collection-list-cell ${colClass} ${className}`}>
      <p className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)] sm:text-[8px] sm:sr-only">
        {label}
      </p>
      <div className="min-w-0 truncate text-xs leading-tight text-[var(--text-secondary)] sm:text-[10px]">
        {children}
      </div>
    </div>
  );
}

function BpmCellContent({
  track,
  enriching = false,
}: {
  track: Track | null | undefined;
  enriching?: boolean;
}) {
  return (
    <span className="collection-list-bpm-inner">
      <span className="collection-list-bpm-loader" aria-hidden={!enriching}>
        {enriching ? (
          <Loader2 className="h-3 w-3 animate-spin text-[var(--violet)]" strokeWidth={2} />
        ) : null}
      </span>
      <BpmDisplay track={track} />
    </span>
  );
}

function ListArtwork({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = resolveDiscogsCoverUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className="collection-list-artwork relative z-[1] h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[var(--bg-subtle)] ring-1 ring-[var(--border)] sm:h-11 sm:w-11"
      aria-hidden={false}
    >
      {imageSrc && !failed ? (
        <img
          src={imageSrc}
          alt=""
          className="block h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--bg-subtle)] to-[var(--bg-hover)]">
          <Disc3 className="h-4 w-4 text-[var(--text-muted)] opacity-70" strokeWidth={1.25} />
        </div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}

function BpmDisplay({ track }: { track: Track | null | undefined }) {
  if (track?.bpm == null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }
  return (
    <span
      className={`tabular-nums font-medium text-[var(--text)] ${track.bpmEstimated ? 'opacity-75' : ''}`}
      title={track.bpmEstimated ? 'Estimated BPM' : undefined}
    >
      {track.bpmEstimated ? '~' : ''}
      {track.bpm}
    </span>
  );
}

function CamelotBadge({ track }: { track: Track | null | undefined }) {
  const { code, estimated } = resolveTrackCamelot(track);
  if (!code) {
    return <span className="text-[9px] text-[var(--text-muted)]">—</span>;
  }
  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1 font-mono text-[11px] font-bold tracking-wider sm:min-w-[2.25rem] sm:px-1.5 sm:py-0.5 sm:text-[10px] ${
        estimated
          ? 'bg-[color-mix(in_srgb,var(--violet-soft)_60%,transparent)] text-[var(--violet)]/90'
          : 'bg-[var(--violet-soft)] text-[var(--violet)]'
      }`}
      title={estimated ? 'Estimated key' : 'Camelot key'}
    >
      {estimated ? <span className="mr-px text-[8px] font-normal opacity-60">~</span> : null}
      {code}
    </span>
  );
}

function MobileRecordMeta({ record }: { record: VinylRecord }) {
  const track = getPrimaryTrack(record);
  const hasBpm = track?.bpm != null;
  const hasKey = !!track?.camelotKey;
  const vibes = (track?.vibeTags ?? []).slice(0, 2);

  if (!hasBpm && !hasKey && vibes.length === 0) return null;

  return (
    <div className="collection-list-mobile-meta sm:hidden">
      <span className="collection-list-tag-slot collection-list-tag-slot--bpm">
        {hasBpm ? (
          <ListTag variant="default" compact>
            {track?.bpmEstimated ? '~' : ''}
            {track?.bpm} BPM
          </ListTag>
        ) : null}
      </span>
      <span className="collection-list-tag-slot collection-list-tag-slot--key">
        {hasKey ? (
          <ListTag variant="violet" compact>
            {track?.camelotKey}
          </ListTag>
        ) : null}
      </span>
      <span className="collection-list-tag-slot collection-list-tag-slot--vibe">
        {vibes.map((t) => (
          <ListTag key={t} variant="accent" compact>
            {t}
          </ListTag>
        ))}
      </span>
    </div>
  );
}

function RecordMetaFields({ record }: { record: VinylRecord }) {
  const track = getPrimaryTrack(record);
  return (
    <>
      <MetaCell label="Format">
        {record.format ?? <span className="text-[var(--text-muted)]">—</span>}
      </MetaCell>
      <MetaCell label="BPM" mixCol>
        <BpmCellContent track={track} />
      </MetaCell>
      <MetaCell label="Key" mixCol>
        <CamelotBadge track={track} />
      </MetaCell>
      <MetaCell label="Vibe" vibeCol>
        {(track?.vibeTags?.length ?? 0) > 0 ? (
          <span className="flex flex-wrap gap-0.5">
            {(track?.vibeTags ?? []).slice(0, 2).map((t) => (
              <ListTag key={t} variant="accent">
                {t}
              </ListTag>
            ))}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </MetaCell>
    </>
  );
}

function ReleaseEnrichAction({
  record,
  enriching,
  onEnrich,
  stopRow,
}: {
  record: VinylRecord;
  enriching: boolean;
  onEnrich: () => void;
  stopRow: (e: MouseEvent | PointerEvent) => void;
}) {
  const complete = isReleaseFullyEnriched(record);

  return (
    <button
      type="button"
      disabled={enriching}
      onClick={(e) => {
        stopRow(e);
        onEnrich();
      }}
      onPointerDown={stopRow}
      className={`collection-list-action-btn relative z-10 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet-soft)] sm:h-7 sm:w-7 ${
        enriching
          ? 'text-[var(--violet)]'
          : complete
            ? 'text-[var(--violet)]/70 hover:bg-[var(--violet-soft)] hover:text-[var(--violet)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--violet-soft)] hover:text-[var(--violet)]'
      }`}
      title={
        enriching
          ? 'Enriching tracks…'
          : complete
            ? 'Re-enrich all tracks (BPM & key)'
            : 'Enrich all tracks (BPM & key)'
      }
      aria-label={
        enriching
          ? 'Enriching tracks'
          : complete
            ? 'Re-enrich all tracks'
            : 'Enrich all tracks'
      }
    >
      {enriching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
    </button>
  );
}

function CollectionListHeader() {
  return (
    <li
      aria-hidden
      className="collection-list-header collection-list-release-grid hidden list-none rounded-md px-3 py-1 sm:grid"
    >
      <span />
      <span />
      <span className={headerLabelClass}>Release</span>
      <span className={`${headerLabelClass} collection-list-cell collection-list-format-col`}>
        Format
      </span>
      <span className={`${headerLabelClass} collection-list-cell collection-list-mix-col`}>
        BPM
      </span>
      <span className={`${headerLabelClass} collection-list-cell collection-list-mix-col`}>
        Key
      </span>
      <span className={`${headerLabelClass} collection-list-cell collection-list-vibe-col`}>
        Vibe
      </span>
      <span />
    </li>
  );
}

function TracklistSubheader() {
  return (
    <div className="collection-list-release-grid hidden border-b border-[var(--border)]/40 px-3 pb-1 pt-0.5 sm:grid">
      <span />
      <span />
      <span className={headerLabelClass}>Track</span>
      <span className={`${headerLabelClass} collection-list-format-col`} />
      <span className={`${headerLabelClass} collection-list-cell collection-list-mix-col`}>
        BPM
      </span>
      <span className={`${headerLabelClass} collection-list-cell collection-list-mix-col`}>
        Key
      </span>
      <span className={`${headerLabelClass} collection-list-cell collection-list-vibe-col`}>
        Vibe
      </span>
      <span />
    </div>
  );
}

function trackNumberLabel(track: Track, index: number): string {
  if (track.position?.trim()) return track.position.trim();
  return String(index + 1).padStart(2, '0');
}

function TrackPlayActions({
  onPlayNow,
  onAddToQueue,
  stopRow,
}: {
  onPlayNow: () => void;
  onAddToQueue: () => void;
  stopRow: (e: MouseEvent | PointerEvent) => void;
}) {
  return (
    <div
      data-row-action
      className="relative z-10 flex shrink-0 items-center gap-0.5"
      onClick={stopRow}
      onPointerDown={stopRow}
    >
      <button
        type="button"
        onClick={(e) => {
          stopRow(e);
          onPlayNow();
        }}
        className="collection-list-action-btn flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] sm:h-7 sm:w-7"
        title="Play now"
        aria-label="Play now"
      >
        <Play className="h-3.5 w-3.5 fill-current sm:h-3 sm:w-3" strokeWidth={0} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          stopRow(e);
          onAddToQueue();
        }}
        className="collection-list-action-btn flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--teal)]/10 hover:text-[var(--teal)] sm:h-7 sm:w-7"
        title="Add to queue"
        aria-label="Add to queue"
      >
        <ListPlus className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}

function TrackListRow({
  track,
  index,
  enriching,
  onPlayNow,
  onAddToQueue,
  stopRow,
}: {
  track: Track;
  index: number;
  enriching?: boolean;
  onPlayNow: () => void;
  onAddToQueue: () => void;
  stopRow: (e: MouseEvent | PointerEvent) => void;
}) {
  const vibes = (track.vibeTags ?? []).slice(0, 3);

  return (
    <>
      <div
        className={`collection-list-mobile-track border-t border-[var(--border)]/35 first:border-t-0 sm:hidden ${
          enriching ? 'bg-[color-mix(in_srgb,var(--violet-soft)_22%,transparent)]' : ''
        }`}
      >
        <div className="collection-list-mobile-track-grid">
          <span className="collection-list-mobile-track-num tabular-nums text-[9px] font-medium text-[var(--text-muted)]">
            {trackNumberLabel(track, index)}
          </span>
          <p
            className="collection-list-mobile-track-title min-w-0 truncate text-[10px] font-medium leading-tight text-[var(--text-secondary)]"
            title={track.title}
          >
            {track.title}
          </p>
          <div className="collection-list-mobile-track-actions">
            <TrackPlayActions
              onPlayNow={onPlayNow}
              onAddToQueue={onAddToQueue}
              stopRow={stopRow}
            />
          </div>
          <div className="collection-list-mobile-track-tags">
            {enriching ? (
              <Loader2
                className="collection-list-mobile-track-loader h-2.5 w-2.5 shrink-0 animate-spin text-[var(--violet)]"
                strokeWidth={2}
              />
            ) : null}
            <span className="collection-list-tag-slot collection-list-tag-slot--bpm">
              {track.bpm != null ? (
                <ListTag variant="default" compact>
                  {track.bpmEstimated ? '~' : ''}
                  {track.bpm}
                </ListTag>
              ) : null}
            </span>
            <span className="collection-list-tag-slot collection-list-tag-slot--key">
              {resolveTrackCamelot(track).code ? (
                <ListTag variant="violet" compact>
                  {resolveTrackCamelot(track).code}
                </ListTag>
              ) : null}
            </span>
            <span className="collection-list-tag-slot collection-list-tag-slot--vibe">
              {vibes.map((t) => (
                <ListTag key={t} variant="accent" compact>
                  {t}
                </ListTag>
              ))}
            </span>
          </div>
        </div>
      </div>

      <div
        className={`collection-list-release-grid hidden border-t border-[var(--border)]/40 px-3 py-1 first:border-t-0 sm:grid ${
          enriching ? 'bg-[color-mix(in_srgb,var(--violet-soft)_22%,transparent)]' : ''
        }`}
      >
        <span aria-hidden />
        <span aria-hidden />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 tabular-nums text-[9px] font-medium text-[var(--text-muted)]">
            {trackNumberLabel(track, index)}
          </span>
          <p className="min-w-0 truncate text-[10px] font-medium text-[var(--text-secondary)]">
            {track.title}
          </p>
        </div>
        <span aria-hidden className="collection-list-format-col" />
        <MetaCell label="BPM" mixCol>
          <BpmCellContent track={track} enriching={enriching} />
        </MetaCell>
        <MetaCell label="Key" mixCol>
          <CamelotBadge track={track} />
        </MetaCell>
        <MetaCell label="Vibe" vibeCol>
          {vibes.length > 0 ? (
            <span className="flex flex-wrap gap-0.5">
              {vibes.map((t) => (
                <ListTag key={t} variant="accent">
                  {t}
                </ListTag>
              ))}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
        </MetaCell>
        <TrackPlayActions
          onPlayNow={onPlayNow}
          onAddToQueue={onAddToQueue}
          stopRow={stopRow}
        />
      </div>
    </>
  );
}

function ReleaseEditAction({
  record,
  stopRow,
}: {
  record: VinylRecord;
  stopRow: (e: MouseEvent | PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        stopRow(e);
        openRecordDetail(record, true);
      }}
      onPointerDown={stopRow}
      className="collection-list-edit-btn collection-list-action-btn relative z-10 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] sm:h-7 sm:w-7"
      title="Edit record"
      aria-label="Edit record"
    >
      <Pencil className="h-3 w-3" strokeWidth={1.75} />
    </button>
  );
}

interface ReleaseListRowProps {
  record: VinylRecord;
  expanded: boolean;
  enriching: boolean;
  onToggle: () => void;
  onEnrich: () => void;
  onDelete: () => void;
  stopRow: (e: MouseEvent | PointerEvent) => void;
}

function ReleaseListRow({
  record,
  expanded,
  enriching,
  onToggle,
  onEnrich,
  onDelete,
  stopRow,
}: ReleaseListRowProps) {
  const hasTracks = record.tracks.length > 0;
  const rowActions = (
    <>
      <ReleaseEnrichAction
        record={record}
        enriching={enriching}
        onEnrich={onEnrich}
        stopRow={stopRow}
      />
      <ReleaseEditAction record={record} stopRow={stopRow} />
      <button
        type="button"
        onClick={(e) => {
          stopRow(e);
          onDelete();
        }}
        className="collection-list-action-btn flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400/90 sm:h-7 sm:w-7"
        aria-label="Remove from collection"
      >
        <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" strokeWidth={2} />
      </button>
    </>
  );

  const desktopRowActions = (
    <div
      data-row-action
      className="relative z-10 flex shrink-0 items-center gap-0.5"
      onClick={stopRow}
      onPointerDown={stopRow}
    >
      {rowActions}
    </div>
  );

  return (
    <>
      {/* Mobile */}
      <div
        className={`collection-list-mobile-release sm:hidden ${
          enriching ? 'bg-[color-mix(in_srgb,var(--violet-soft)_18%,transparent)]' : ''
        }`}
        aria-expanded={hasTracks ? expanded : undefined}
        aria-busy={enriching}
      >
        <div
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-row-action]')) return;
            onToggle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          className="collection-list-mobile-row cursor-pointer"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasTracks) onToggle();
            }}
            className="collection-list-expand-btn flex h-7 w-5 shrink-0 items-center justify-center self-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
            aria-label={expanded ? 'Collapse tracks' : 'Expand tracks'}
            disabled={!hasTracks}
          >
            {hasTracks ? (
              <motion.span
                animate={{ rotate: expanded ? 90 : 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </motion.span>
            ) : (
              <span className="inline-block w-3.5" aria-hidden />
            )}
          </button>

          <RecordArtworkButton
            record={record}
            className="collection-list-mobile-art shrink-0 border-0 bg-transparent p-0"
          >
            <ListArtwork src={record.coverUrl} title={record.title} />
          </RecordArtworkButton>

          <button
            type="button"
            className="collection-list-mobile-body min-w-0 border-0 bg-transparent p-0 text-left"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openRecordDetail(record);
            }}
            aria-label={`View ${record.title} by ${record.artist}`}
          >
            <p
              className="line-clamp-2 text-[12px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--text)] sm:text-[13px] sm:leading-[1.2]"
              style={{ fontFamily: 'var(--font-display)' }}
              title={record.title}
            >
              {record.title}
            </p>
            <p
              className="mt-px truncate text-[10px] leading-tight text-[var(--text-secondary)] sm:mt-0.5 sm:text-[11px]"
              title={`${record.artist}${record.year ? ` · ${record.year}` : ''}`}
            >
              {record.artist}
              {record.year ? (
                <span className="text-[var(--text-muted)]"> · {record.year}</span>
              ) : null}
            </p>
            {!expanded ? <MobileRecordMeta record={record} /> : null}
          </button>

          <div
            data-row-action
            className="collection-list-mobile-actions"
            onClick={stopRow}
            onPointerDown={stopRow}
          >
            {rowActions}
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-row-action]')) return;
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`collection-list-release-grid hidden w-full cursor-pointer px-3 py-2 transition-colors sm:grid ${
          enriching ? 'bg-[color-mix(in_srgb,var(--violet-soft)_18%,transparent)]' : ''
        }`}
        aria-expanded={hasTracks ? expanded : undefined}
        aria-busy={enriching}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasTracks) onToggle();
          }}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          aria-label={expanded ? 'Collapse tracks' : 'Expand tracks'}
          disabled={!hasTracks}
        >
          {hasTracks ? (
            <motion.span
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </motion.span>
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </button>
        <RecordArtworkButton
          record={record}
          className="flex shrink-0 border-0 bg-transparent p-0"
        >
          <ListArtwork src={record.coverUrl} title={record.title} />
        </RecordArtworkButton>
        <button
          type="button"
          className="min-w-0 border-0 bg-transparent p-0 text-left"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openRecordDetail(record);
          }}
          aria-label={`View ${record.title} by ${record.artist}`}
        >
          <p
            className="truncate text-xs font-semibold leading-tight tracking-tight text-[var(--text)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {record.title}
          </p>
          <p className="mt-px truncate text-[10px] leading-tight text-[var(--text-secondary)]">
            {record.artist}
            {record.year ? (
              <span className="text-[var(--text-muted)]"> · {record.year}</span>
            ) : null}
          </p>
          {record.format ? (
            <p className="mt-0.5 truncate text-[9px] text-[var(--text-muted)]">{record.format}</p>
          ) : null}
        </button>
        <div className="contents" onClick={stopRow} onPointerDown={stopRow}>
          <RecordMetaFields record={record} />
        </div>
        {desktopRowActions}
      </div>
    </>
  );
}

export function CollectionListView({
  records,
  liveEnrich = null,
  onPlayNow,
  onAddToQueue,
  onDelete,
  onEnrichRelease,
}: CollectionListViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  useEffect(() => {
    const activeId = liveEnrich?.recordId ?? enrichingId;
    if (!activeId) return;
    setExpandedIds((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [liveEnrich?.recordId, enrichingId]);

  const stopRow = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation();
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className="collection-list flex min-w-0 flex-col overflow-x-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 shadow-[var(--shadow)] sm:gap-1 sm:p-1.5">
      <CollectionListHeader />
      {records.map((record) => {
        const expanded = expandedIds.has(record.id);
        const showTracks = expanded && record.tracks.length > 0;
        const enriching =
          enrichingId === record.id || liveEnrich?.recordId === record.id;
        const enrichingTrackId =
          liveEnrich?.recordId === record.id ? liveEnrich.trackId : null;

        return (
          <motion.li
            key={record.id}
            layout
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className={`collection-list-row group overflow-hidden rounded-md transition-[background,box-shadow] duration-200 hover:bg-[var(--bg-hover)] ${
              expanded ? 'bg-[color-mix(in_srgb,var(--bg-hover)_65%,transparent)]' : ''
            } ${enriching ? 'ring-1 ring-inset ring-[var(--violet)]/15' : ''}`}
          >
            <ReleaseListRow
              record={record}
              expanded={expanded}
              enriching={enriching}
              onToggle={() => toggleExpanded(record.id)}
              onDelete={() => onDelete(record.id)}
              stopRow={stopRow}
              onEnrich={async () => {
                setEnrichingId(record.id);
                try {
                  await onEnrichRelease(record.id);
                } finally {
                  setEnrichingId((id) => (id === record.id ? null : id));
                }
              }}
            />

            <AnimatePresence initial={false}>
              {showTracks ? (
                <motion.div
                  key="tracks"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className={`collection-list-tracks overflow-hidden border-t border-[var(--border)]/50 bg-[color-mix(in_srgb,var(--bg-subtle)_55%,transparent)] py-0.5 ${
                    enriching ? 'opacity-90' : ''
                  }`}
                >
                  <TracklistSubheader />
                  {record.tracks.map((track, index) => (
                    <TrackListRow
                      key={track.id}
                      track={track}
                      index={index}
                      enriching={enrichingTrackId === track.id}
                      stopRow={stopRow}
                      onPlayNow={() => onPlayNow(record, track)}
                      onAddToQueue={() => onAddToQueue(record, track)}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
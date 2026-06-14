import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Disc3, Loader2, Play, Sparkles, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { resolveTrackCamelot } from '../../lib/camelot';
import {
  activeTrackSideLabel,
  groupReleaseTracks,
  otherTracksOnRelease,
} from '../../lib/releaseTrackGroups';
import { trackPositionLabel } from '../../lib/playSession';
import { shouldShowBpmEstimatePrefix } from '../../lib/tracks';
import type { CutRating, Track, VinylRecord } from '../../lib/types';
import { RecordArtwork } from '../RecordArtwork';
import { CutRatingControl } from './CutRatingControl';

interface ReleaseTrackPickerSheetProps {
  open: boolean;
  record: VinylRecord | null;
  activeTrackId: string | null;
  enrichingRelease?: boolean;
  onClose: () => void;
  onSelectTrack: (track: Track) => void;
  onEnrichRelease?: () => void | Promise<void>;
  onOpenReleaseDetail?: () => void;
  onSaveCutRating?: (trackId: string, rating: CutRating | undefined) => void;
}

interface TrackMixMeta {
  duration?: string;
  bpm?: { value: number; estimated: boolean };
  key?: { code: string; estimated: boolean };
}

function trackMixMeta(track: Track): TrackMixMeta {
  const meta: TrackMixMeta = {};
  if (track.duration?.trim()) meta.duration = track.duration.trim();
  if (track.bpm != null) {
    meta.bpm = {
      value: track.bpm,
      estimated: shouldShowBpmEstimatePrefix(track),
    };
  }
  const { code, estimated } = resolveTrackCamelot(track);
  if (code) meta.key = { code, estimated: estimated ?? false };
  return meta;
}

function TrackMetaChips({ meta }: { meta: TrackMixMeta }) {
  const hasChips = meta.duration || meta.bpm || meta.key;
  if (!hasChips) return null;

  return (
    <span className="release-picker__chips">
      {meta.duration ? (
        <span className="release-picker__chip release-picker__chip--duration tabular-nums">
          {meta.duration}
        </span>
      ) : null}
      {meta.bpm ? (
        <span className="release-picker__chip release-picker__chip--bpm tabular-nums">
          {meta.bpm.estimated ? '~' : ''}
          {meta.bpm.value} BPM
        </span>
      ) : null}
      {meta.key ? (
        <span
          className={`release-picker__chip release-picker__chip--key tabular-nums${
            meta.key.estimated ? ' release-picker__chip--estimated' : ''
          }`}
        >
          {meta.key.code}
        </span>
      ) : null}
    </span>
  );
}

const SelectableTrackRow = forwardRef<
  HTMLButtonElement,
  {
    track: Track;
    index: number;
    listIndex: number;
    onSelect: (track: Track) => void;
    onSaveCutRating?: (trackId: string, rating: CutRating | undefined) => void;
  }
>(function SelectableTrackRow({ track, index, listIndex, onSelect, onSaveCutRating }, ref) {
  const meta = trackMixMeta(track);
  const position = trackPositionLabel(track, index);

  return (
    <motion.li
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(listIndex * 0.02, 0.16), duration: 0.18 }}
    >
      <div className="release-picker__track">
        <button
          ref={ref}
          type="button"
          role="option"
          aria-selected={false}
          tabIndex={0}
          className="release-picker__track-hit"
          onClick={() => onSelect(track)}
        >
          <span className="release-picker__pos font-mono tabular-nums">{position}</span>
          <span className="release-picker__track-main min-w-0">
            <span className="release-picker__track-title-row">
              <span className="release-picker__track-title">{track.title}</span>
              {track.isPrimary ? (
                <span className="release-picker__primary-badge" title="Lead cut on this release">
                  Lead
                </span>
              ) : null}
            </span>
            <TrackMetaChips meta={meta} />
          </span>
          <span className="release-picker__play-pill" aria-hidden>
            <Play className="h-3.5 w-3.5" strokeWidth={2.25} fill="currentColor" />
          </span>
        </button>
        {onSaveCutRating ? (
          <CutRatingControl
            rating={track.cutRating}
            size="xs"
            className="release-picker__track-rating"
            onChange={(next) => onSaveCutRating(track.id, next)}
          />
        ) : (
          <CutRatingControl
            rating={track.cutRating}
            size="xs"
            readonly
            className="release-picker__track-rating"
          />
        )}
      </div>
    </motion.li>
  );
});

export function ReleaseTrackPickerSheet({
  open,
  record,
  activeTrackId,
  enrichingRelease = false,
  onClose,
  onSelectTrack,
  onEnrichRelease,
  onOpenReleaseDetail,
  onSaveCutRating,
}: ReleaseTrackPickerSheetProps) {
  const isMobile = useIsMobile();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const tracks = record?.tracks ?? [];

  const activeEntry = useMemo(() => {
    const index = tracks.findIndex((t) => t.id === activeTrackId);
    if (index < 0) return null;
    return { track: tracks[index], index };
  }, [tracks, activeTrackId]);

  const otherTracks = useMemo(
    () => otherTracksOnRelease(tracks, activeTrackId),
    [tracks, activeTrackId]
  );

  const trackGroups = useMemo(() => {
    const groups = groupReleaseTracks(otherTracks.map(({ track }) => track));
    const indexById = new Map(otherTracks.map(({ track, index }) => [track.id, index]));

    return groups.map((group) => ({
      ...group,
      tracks: group.tracks.map(({ track }) => ({
        track,
        index: indexById.get(track.id) ?? 0,
      })),
    }));
  }, [otherTracks]);

  const showSideHeaders = trackGroups.some((g) => g.showHeader);
  const activeSide = activeTrackSideLabel(activeEntry?.track);
  const activeMeta = activeEntry ? trackMixMeta(activeEntry.track) : null;

  const focusOption = useCallback((index: number) => {
    const el = optionRefs.current[index];
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      const count = otherTracks.length;
      if (count === 0) return;

      const focused = optionRefs.current.findIndex((el) => el === document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusOption(focused < 0 ? 0 : Math.min(focused + 1, count - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusOption(focused < 0 ? count - 1 : Math.max(focused - 1, 0));
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusOption(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusOption(count - 1);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, otherTracks.length, focusOption]);

  useEffect(() => {
    if (!open || isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  useEffect(() => {
    optionRefs.current = [];
  }, [open, record?.id, activeTrackId]);

  const sheetMotion = isMobile
    ? {
        initial: { y: '100%', opacity: 0.94 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0.94 },
      }
    : {
        initial: { opacity: 0, y: 18, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.98 },
      };

  let optionIndex = 0;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && record ? (
        <div
          className={`release-picker-portal${isMobile ? ' release-picker-portal--mobile' : ' release-picker-portal--desktop'}`}
        >
          <motion.button
            type="button"
            className="release-picker__backdrop"
            aria-label="Close release tracks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-picker-title"
            aria-describedby="release-picker-desc"
            className={`release-picker${isMobile ? ' release-picker--mobile' : ' release-picker--desktop'}`}
            initial={sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          >
            <div className="release-picker__handle" aria-hidden />

            <header className="release-picker__header">
              <div className="release-picker__header-top">
                <div className="release-picker__hero">
                  <div className="release-picker__art">
                    <RecordArtwork
                      src={record.coverUrl}
                      title={record.title}
                      fill
                      className="rounded-xl"
                    />
                  </div>
                  <div className="release-picker__meta min-w-0">
                    <p className="release-picker__eyebrow">Switch track</p>
                    <h2 id="release-picker-title" className="release-picker__title">
                      {record.title}
                    </h2>
                    <p className="release-picker__artist">{record.artist}</p>
                    <p id="release-picker-desc" className="release-picker__count">
                      {tracks.length} cut{tracks.length === 1 ? '' : 's'} on this release
                      {record.year ? ` · ${record.year}` : ''}
                      {record.format ? ` · ${record.format}` : ''}
                    </p>
                  </div>
                </div>
                <div className="release-picker__header-actions">
                  {onEnrichRelease ? (
                    <button
                      type="button"
                      className="release-picker__enrich-icon"
                      onClick={() => void onEnrichRelease()}
                      disabled={enrichingRelease}
                      aria-label={enrichingRelease ? 'Enriching release' : 'Enrich release'}
                      title="Enrich all tracks (BPM & key)"
                    >
                      {enrichingRelease ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="release-picker__close"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {activeEntry ? (
                <button
                  type="button"
                  className="release-picker__now-strip"
                  onClick={onClose}
                  aria-label={`Keep playing ${activeEntry.track.title}`}
                >
                  <span className="release-picker__now-strip-label">Now playing</span>
                  <span className="release-picker__now-pos font-mono tabular-nums">
                    {trackPositionLabel(activeEntry.track, activeEntry.index)}
                  </span>
                  <span className="release-picker__now-strip-title">{activeEntry.track.title}</span>
                  {activeMeta ? <TrackMetaChips meta={activeMeta} /> : null}
                  {activeSide ? (
                    <span className="release-picker__section-tag release-picker__now-strip-side">
                      {activeSide}
                    </span>
                  ) : null}
                  <span className="release-picker__now-badge">
                    <span className="release-picker__now-dot" />
                    Live
                  </span>
                </button>
              ) : null}
            </header>

            <div className="release-picker__body">
              {otherTracks.length > 0 ? (
                <section
                  className="release-picker__section release-picker__section--choose"
                  aria-label="Play another track"
                >
                  <div className="release-picker__section-head">
                    <h3 className="release-picker__section-title">Play another cut</h3>
                    <span className="release-picker__section-hint tabular-nums">
                      {otherTracks.length} available
                    </span>
                  </div>

                  <div className="release-picker__col-head" aria-hidden>
                    <span className="release-picker__col-head-pos">#</span>
                    <span className="release-picker__col-head-track">Track</span>
                    <span className="release-picker__col-head-rating">Rating</span>
                    <span className="release-picker__col-head-play" />
                  </div>

                  {trackGroups.map((group) => (
                    <div key={group.id} className="release-picker__group">
                      {showSideHeaders && group.showHeader ? (
                        <h4 className="release-picker__side-label">{group.label}</h4>
                      ) : null}
                      <ul
                        className="release-picker__list"
                        role="listbox"
                        aria-label={
                          group.showHeader && showSideHeaders
                            ? `Tracks on ${group.label}`
                            : 'Other tracks on this release'
                        }
                      >
                        {group.tracks.map(({ track, index }) => {
                          const currentOptionIndex = optionIndex;
                          optionIndex += 1;
                          return (
                            <SelectableTrackRow
                              key={track.id}
                              ref={(el) => {
                                optionRefs.current[currentOptionIndex] = el;
                              }}
                              track={track}
                              index={index}
                              listIndex={currentOptionIndex}
                              onSelect={onSelectTrack}
                              onSaveCutRating={onSaveCutRating}
                            />
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              ) : (
                <p className="release-picker__solo-note">
                  This release only has one playable cut on file.
                </p>
              )}
            </div>

            {onOpenReleaseDetail ? (
              <footer className="release-picker__footer">
                <button
                  type="button"
                  className="release-picker__detail-link"
                  onClick={onOpenReleaseDetail}
                >
                  <Disc3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Release details & crate notes</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                </button>
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
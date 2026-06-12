import { motion } from 'framer-motion';
import { Clock, Music2 } from 'lucide-react';
import { openRecordDetail } from '../lib/recordDetail';
import { getPrimaryTrack } from '../lib/tracks';
import type { VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';

interface RecordCardProps {
  record: VinylRecord;
  onPlay?: () => void;
  index?: number;
  compact?: boolean;
  dense?: boolean;
}

export function RecordCard({
  record,
  onPlay,
  index = 0,
  compact,
  dense,
}: RecordCardProps) {
  const track = getPrimaryTrack(record);
  const viewRecord = () => openRecordDetail(record);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: dense ? 6 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        delay: dense ? index * 0.015 : index * 0.04,
        duration: dense ? 0.25 : 0.35,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: dense ? -2 : -4 }}
      whileTap={{ scale: 0.98 }}
      className={`record-card-wrap group cursor-pointer ${dense ? 'record-card-wrap--dense' : ''}`}
      onClick={viewRecord}
      onKeyDown={(e) => e.key === 'Enter' && viewRecord()}
      role="button"
      tabIndex={0}
    >
      <div
        className={`record-card overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)] group-hover:border-[var(--border-strong)] ${
          dense ? 'record-card--dense rounded-xl' : 'rounded-2xl'
        } ${compact && !dense ? 'p-3' : ''}`}
      >
        <div
          className={`record-card__art relative aspect-square w-full overflow-hidden bg-[var(--bg-subtle)] ${
            dense ? '' : compact ? 'mb-3' : ''
          }`}
        >
          <button
            type="button"
            className="record-card__art-hit absolute inset-0 z-[1] border-0 bg-transparent p-0"
            onClick={(e) => {
              e.stopPropagation();
              viewRecord();
            }}
            aria-label={`View ${record.title} by ${record.artist}`}
          />
          <RecordArtwork
            src={record.coverUrl}
            title={record.title}
            fill
            className="rounded-none"
          />
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            className={`record-card__play-btn absolute z-10 rounded-full bg-[var(--accent)] text-white shadow-md transition-all duration-200 ${
              dense
                ? 'bottom-2 right-2 flex h-9 w-9 items-center justify-center opacity-100 sm:bottom-1.5 sm:right-1.5 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100'
                : 'bottom-3 right-3 flex h-11 w-11 items-center justify-center opacity-100 shadow-lg sm:opacity-0 sm:group-hover:opacity-100'
            }`}
            whileTap={{ scale: 0.9 }}
            aria-label="Mark as played"
          >
            <Music2 className={dense ? 'h-3.5 w-3.5 sm:h-3 sm:w-3' : 'h-4 w-4'} />
          </motion.button>
          {record.lastPlayedAt && (
            <span
              className={`pointer-events-none absolute left-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full bg-black/50 font-medium uppercase tracking-wider text-white/90 backdrop-blur-sm ${
                dense ? 'px-1.5 py-0.5 text-[8px] sm:py-px' : 'left-2 top-2 gap-1 px-2 py-0.5 text-[9px]'
              }`}
            >
              <Clock className={dense ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
              {!dense && 'Played'}
            </span>
          )}
        </div>
        <div className={dense ? 'px-2.5 pb-2.5 pt-2 sm:p-2 sm:pt-1.5' : compact ? '' : 'p-4 pt-3'}>
          <h3
            className={`truncate font-semibold leading-tight ${
              dense ? 'text-xs sm:text-[11px]' : 'text-sm'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
            title={record.title}
          >
            {record.title}
          </h3>
          <p
            className={`truncate text-[var(--text-secondary)] ${
              dense ? 'mt-0.5 text-[11px] sm:text-[10px]' : 'mt-0.5 text-xs'
            }`}
            title={record.artist}
          >
            {record.artist}
          </p>
          {!dense && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {record.format && <span className="tag-pill">{record.format}</span>}
              {track?.camelotKey && (
                <span className="tag-pill tag-pill--violet">{track.camelotKey}</span>
              )}
              {track?.bpm != null && <span className="tag-pill">{track.bpm} BPM</span>}
              {(track?.vibeTags ?? []).slice(0, 2).map((t) => (
                <span key={t} className="tag-pill tag-pill--accent">
                  {t}
                </span>
              ))}
            </div>
          )}
          {dense && (track?.camelotKey || track?.bpm != null) && (
            <p
              className="record-card__meta mt-1.5 truncate text-[10px] text-[var(--text-muted)] sm:mt-1 sm:text-[9px]"
              title={[track?.camelotKey, track?.bpm != null ? `${track.bpm} BPM` : null]
                .filter(Boolean)
                .join(' · ')}
            >
              {[track?.camelotKey, track?.bpm != null ? `${track.bpm} BPM` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}
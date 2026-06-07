import { motion } from 'framer-motion';
import { Clock, Music2 } from 'lucide-react';
import { getPrimaryTrack } from '../lib/tracks';
import type { VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';

interface RecordCardProps {
  record: VinylRecord;
  onClick?: () => void;
  onPlay?: () => void;
  index?: number;
  compact?: boolean;
  dense?: boolean;
}

export function RecordCard({
  record,
  onClick,
  onPlay,
  index = 0,
  compact,
  dense,
}: RecordCardProps) {
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
      className="group cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      role="button"
      tabIndex={0}
    >
      <div
        className={`record-card overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)] group-hover:border-[var(--border-strong)] ${
          dense ? 'rounded-lg' : 'rounded-2xl'
        } ${compact && !dense ? 'p-3' : ''}`}
      >
        <div
          className={`relative aspect-square ${
            dense ? '' : compact ? 'mb-3' : ''
          }`}
        >
          <RecordArtwork src={record.coverUrl} title={record.title} />
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            className={`absolute rounded-full bg-[var(--accent)] text-white opacity-0 shadow-md transition-all duration-200 group-hover:opacity-100 ${
              dense
                ? 'bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center'
                : 'bottom-3 right-3 flex h-10 w-10 items-center justify-center shadow-lg'
            }`}
            whileTap={{ scale: 0.9 }}
            aria-label="Mark as played"
          >
            <Music2 className={dense ? 'h-3 w-3' : 'h-4 w-4'} />
          </motion.button>
          {record.lastPlayedAt && (
            <span
              className={`absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/50 font-medium uppercase tracking-wider text-white/90 backdrop-blur-sm ${
                dense ? 'px-1.5 py-px text-[8px]' : 'left-2 top-2 gap-1 px-2 py-0.5 text-[9px]'
              }`}
            >
              <Clock className={dense ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
              {!dense && 'Played'}
            </span>
          )}
        </div>
        <div className={dense ? 'p-2 pt-1.5' : compact ? '' : 'p-4 pt-3'}>
          <h3
            className={`truncate font-semibold leading-tight ${
              dense ? 'text-[11px]' : 'text-sm'
            }`}
          >
            {record.title}
          </h3>
          <p
            className={`truncate text-[var(--text-secondary)] ${
              dense ? 'mt-0.5 text-[10px]' : 'mt-0.5 text-xs'
            }`}
          >
            {record.artist}
          </p>
          {!dense && (() => {
            const track = getPrimaryTrack(record);
            return (
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
            );
          })()}
          {dense && (() => {
            const track = getPrimaryTrack(record);
            if (!track?.camelotKey && track?.bpm == null) return null;
            return (
              <p className="mt-1 truncate text-[9px] text-[var(--text-muted)]">
                {[track.camelotKey, track.bpm != null ? `${track.bpm}bpm` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            );
          })()}
        </div>
      </div>
    </motion.article>
  );
}
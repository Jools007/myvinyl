import { Disc3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { resolveDiscogsCoverUrl } from '../lib/discogsCover';

interface RecordArtworkProps {
  src?: string;
  title: string;
  size?: 'sm' | 'md' | 'queue' | 'play' | 'now' | 'hero' | 'lg';
  /** Fill a positioned parent (use with aspect-square + relative wrapper). */
  fill?: boolean;
  className?: string;
}

const sizes = {
  sm: 'h-12 w-12 shrink-0 rounded-lg',
  md: 'h-full w-full rounded-xl',
  queue: 'h-14 w-14 shrink-0 rounded-lg sm:h-[4.25rem] sm:w-[4.25rem] sm:rounded-xl',
  play: 'h-[4.5rem] w-[4.5rem] shrink-0 rounded-xl sm:h-24 sm:w-24',
  now: 'h-[5.5rem] w-[5.5rem] shrink-0 rounded-xl sm:h-[7.5rem] sm:w-[7.5rem] sm:rounded-2xl',
  hero: 'h-28 w-28 shrink-0 rounded-2xl sm:h-32 sm:w-32',
  lg: 'h-48 w-48 shrink-0 rounded-2xl',
};

export function RecordArtwork({
  src,
  title,
  size = 'md',
  fill = false,
  className = '',
}: RecordArtworkProps) {
  const sizeClass = fill ? 'record-artwork--fill absolute inset-0 h-full w-full' : sizes[size];
  const imageSrc = resolveDiscogsCoverUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={`record-artwork relative overflow-hidden bg-[var(--bg-subtle)] ${sizeClass} ${className}`}
    >
      {imageSrc && !failed ? (
        <img
          src={imageSrc}
          alt={title}
          className="record-artwork__img block h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="record-artwork__placeholder flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[var(--bg-subtle)] to-[var(--bg-hover)]"
          aria-hidden
        >
          <Disc3
            className="h-1/3 w-1/3 min-h-[1.25rem] min-w-[1.25rem] text-[var(--text-muted)] opacity-50"
            strokeWidth={1}
          />
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-[var(--border)]"
        aria-hidden
      />
    </div>
  );
}
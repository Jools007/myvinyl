import { motion } from 'framer-motion';
import { Disc3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { proxyCoverUrl } from '../lib/api';

interface RecordArtworkProps {
  src?: string;
  title: string;
  size?: 'sm' | 'md' | 'queue' | 'play' | 'now' | 'hero' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-12 w-12 rounded-lg',
  md: 'h-full w-full rounded-xl',
  queue: 'h-14 w-14 rounded-lg sm:h-[4.25rem] sm:w-[4.25rem] sm:rounded-xl',
  play: 'h-[4.5rem] w-[4.5rem] rounded-xl sm:h-24 sm:w-24',
  now: 'h-[5.5rem] w-[5.5rem] rounded-xl sm:h-[7.5rem] sm:w-[7.5rem] sm:rounded-2xl',
  hero: 'h-28 w-28 rounded-2xl sm:h-32 sm:w-32',
  lg: 'h-48 w-48 rounded-2xl',
};

export function RecordArtwork({ src, title, size = 'md', className = '' }: RecordArtworkProps) {
  const sizeClass = sizes[size];
  const imageSrc = proxyCoverUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden bg-[var(--bg-subtle)] ${sizeClass} ${className}`}
    >
      {imageSrc && !failed ? (
        <motion.img
          src={imageSrc}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[var(--bg-subtle)] to-[var(--bg-hover)]">
          <Disc3
            className="h-1/3 w-1/3 text-[var(--text-muted)] opacity-50"
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
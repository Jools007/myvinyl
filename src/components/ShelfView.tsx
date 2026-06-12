import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { normalizeGenre } from '../lib/filterLabels';
import { openRecordDetail } from '../lib/recordDetail';
import { getPrimaryTrack } from '../lib/tracks';
import type { VinylRecord } from '../lib/types';
import { RecordArtwork } from './RecordArtwork';
import { RecordArtworkButton } from './RecordArtworkButton';

interface ShelfViewProps {
  records: VinylRecord[];
}

export function ShelfView({ records }: ShelfViewProps) {
  const grouped = (() => {
    const map = new Map<string, VinylRecord[]>();
    for (const r of records) {
      const g =
        r.genres && r.genres.length > 0 ? normalizeGenre(r.genres[0]) || 'Other' : 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const countDiff = b[1].length - a[1].length;
      if (countDiff !== 0) return countDiff;
      return a[0].localeCompare(b[0]);
    });
  })();

  if (records.length === 0) return null;

  return (
    <div className="shelf-view space-y-1 pt-1">
      <AnimatePresence mode="popLayout">
        {grouped.map(([genre, genreRecords]) => (
          <motion.div
            key={genre}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.7 }}
          >
            <GenreShelf genre={genre} records={genreRecords} />
          </motion.div>
        ))}
      </AnimatePresence>
      {grouped.length > 1 && (
        <p className="shelf-view__hint px-1 pt-3 text-center text-[10px] text-[var(--text-muted)]/60">
          <span className="sm:hidden">Swipe to browse crates</span>
          <span className="hidden sm:inline">Drag to scroll · hover for arrows</span>
        </p>
      )}
    </div>
  );
}

interface GenreShelfProps {
  genre: string;
  records: VinylRecord[];
}

function GenreShelf({ genre, records }: GenreShelfProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ startX: 0, startScroll: 0 });

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(260, Math.floor(el.clientWidth * 0.78));
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scroll('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scroll('right');
      }
    },
    [scroll]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    dragInfo.current = { startX: e.clientX, startScroll: el.scrollLeft };
    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
    el.style.scrollSnapType = 'none';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const el = scrollerRef.current;
    if (!el) return;
    const delta = e.clientX - dragInfo.current.startX;
    el.scrollLeft = dragInfo.current.startScroll - delta;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.style.scrollSnapType = 'x mandatory';
    }
    setIsDragging(false);
  };

  return (
    <div className="genre-shelf group/shelf mb-7 last:mb-2 sm:mb-9 sm:last:mb-3">
      <div className="mb-2 flex items-baseline justify-between px-0.5 sm:mb-2.5 sm:px-1">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <h3 className="font-display text-base font-semibold tracking-[-0.02em] text-cream sm:text-[19px]">
            {genre}
          </h3>
          <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-px text-[10px] font-medium tabular-nums text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border)]/50">
            {records.length}
          </span>
        </div>
      </div>

      <div className="shelf-container relative">
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label={`Scroll ${genre} left`}
          className="shelf-scroll-btn absolute left-1 top-[42%] z-30 -translate-y-1/2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)]/95 p-2 text-[var(--text)] shadow-lg backdrop-blur-sm transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] active:scale-[0.94] sm:left-2 sm:top-1/2 sm:p-2.5 sm:opacity-70 sm:group-hover/shelf:opacity-100"
        >
          <ChevronLeft className="h-4 w-4 sm:h-4 sm:w-4" />
        </button>

        <div
          ref={scrollerRef}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          tabIndex={0}
          aria-label={`${genre} shelf — horizontal scroll. Drag to scroll, use arrows or keyboard.`}
          className={`shelf-scroller flex items-end gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-7 pl-1 pr-12 pt-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-soft)] sm:gap-4 sm:pb-8 sm:pl-2 sm:pr-9 ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        >
          {records.map((record) => {
            const primary = getPrimaryTrack(record);
            return (
              <motion.div
                key={record.id}
                className="group/shelf-card relative flex w-[7.25rem] shrink-0 snap-start flex-col text-left outline-none sm:w-28"
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                whileHover={{ y: -13, rotate: -1.1 }}
                whileTap={{ scale: 0.982, y: -3 }}
              >
                <RecordArtworkButton
                  record={record}
                  className="shelf-card__open shelf-spine relative mb-1.5 w-full overflow-hidden rounded-xl border border-b-0 border-[var(--border)] bg-[var(--bg-elevated)] p-0 text-left shadow-[0_8px_18px_-6px_rgb(0,0,0,0.55),0_1px_0_0_rgb(255,255,255,0.06)_inset] transition-all duration-200 group-hover/shelf-card:shadow-[0_20px_36px_-10px_rgb(0,0,0,0.55)] group-hover/shelf-card:border-[var(--border-strong)]"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-[var(--bg-subtle)]">
                    <RecordArtwork
                      src={record.coverUrl}
                      title={record.title}
                      fill
                      className="rounded-none"
                    />
                  </div>
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-[3.5px] opacity-45"
                    style={{ background: `linear-gradient(180deg, var(--accent), var(--violet))` }}
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
                </RecordArtworkButton>

                <button
                  type="button"
                  className="w-full border-0 bg-transparent px-0.5 pb-0.5 text-left"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    openRecordDetail(record);
                  }}
                  aria-label={`View ${record.title} by ${record.artist}`}
                >
                  <p className="truncate text-[11px] font-semibold leading-tight tracking-[-0.008em] text-cream sm:text-[10.5px]">
                    {record.title}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)] sm:text-[8.5px]">
                    {record.artist}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] tracking-wide text-[var(--text-muted)]/80 sm:text-[7.5px]">
                    {record.year && <span className="tabular-nums">{record.year}</span>}
                    {primary?.camelotKey && (
                      <span className="rounded bg-[var(--violet-soft)] px-1 py-px font-medium text-[var(--violet)]">
                        {primary.camelotKey}
                      </span>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scroll('right')}
          aria-label={`Scroll ${genre} right`}
          className="shelf-scroll-btn absolute right-1 top-[42%] z-30 -translate-y-1/2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)]/95 p-2 text-[var(--text)] shadow-lg backdrop-blur-sm transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] active:scale-[0.94] sm:right-2 sm:top-1/2 sm:p-2.5 sm:opacity-70 sm:group-hover/shelf:opacity-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-[3px] left-1 right-1 h-2.5 rounded-sm"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--bg-hover) 68%, transparent) 0%, var(--bg-subtle) 50%, transparent 100%)',
            boxShadow: '0 1px 0 0 color-mix(in srgb, var(--border) 38%, transparent)',
          }}
        />
      </div>
    </div>
  );
}
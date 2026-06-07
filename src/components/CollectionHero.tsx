import { motion } from 'framer-motion';
import type { RefObject } from 'react';
import {
  DiscogsSearchBar,
  type DiscogsSearchBarHandle,
} from './DiscogsSearchBar';
import type { VinylRecord } from '../lib/types';

interface CollectionHeroProps {
  recordCount: number;
  collectionDiscogsIds: number[];
  onAdd: (record: Omit<VinylRecord, 'id' | 'addedAt'>) => void;
  onDiscogsImport?: () => void;
  searchRef?: RefObject<DiscogsSearchBarHandle | null>;
}

export function CollectionHero({
  recordCount,
  collectionDiscogsIds,
  onAdd,
  onDiscogsImport,
  searchRef,
}: CollectionHeroProps) {
  return (
    <>
      <section
        id="collection-hero"
        className="collection-hero relative overflow-visible pt-0 -mt-8 min-h-0 sm:pt-0 sm:mt-0 sm:min-h-[var(--hero-height)] sm:rounded-2xl sm:border sm:border-[var(--border)]"
        aria-label="Your collection"
      >
        <div className="collection-hero__backdrop absolute inset-0 overflow-hidden rounded-2xl hidden sm:block" aria-hidden>
          <div className="collection-hero__media absolute inset-0">
            <img
              src="/images/collection-hero.jpg"
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <div className="collection-hero__grade absolute inset-0" />
          <div className="collection-hero__vignette absolute inset-0" />
          <div className="collection-hero__search-scrim absolute inset-0" />
          <div className="collection-hero__grain absolute inset-0" />
          <div className="collection-hero__glow collection-hero__glow--accent" />
          <div className="collection-hero__glow collection-hero__glow--violet" />
        </div>

        {/* Discogs search overlaid on upper hero */}
        <div
          id="collection-discogs-search"
          className="collection-hero__discogs sticky top-12 sm:absolute sm:top-0 sm:inset-x-0 z-[3] flex justify-center px-0 py-0 sm:px-6 sm:py-0 bg-[#111] sm:bg-transparent z-50 sm:z-[3]"
        >
          <DiscogsSearchBar
            ref={searchRef}
            variant="hero"
            onAdd={onAdd}
            onDiscogsImport={onDiscogsImport}
            collectionDiscogsIds={collectionDiscogsIds}
          />
        </div>

        {/* Title + copy anchored to bottom */}
        <div className="collection-hero__copy absolute inset-x-0 bottom-0 z-[1] p-5 sm:p-8 hidden sm:block">
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="max-w-xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--accent)]">
              Personal crate
            </p>
            <h1
              className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Your collection
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
              {recordCount > 0
                ? `${recordCount} records — filter below or search Discogs to grow your crate.`
                : 'Search Discogs, auto-fill BPM & Camelot keys, and build a crate that mixes itself.'}
            </p>
          </motion.div>
        </div>
      </section>

      <div className="collection-hero-divider hidden sm:block" aria-hidden>
        <span className="collection-hero-divider__line" />
      </div>
    </>
  );
}
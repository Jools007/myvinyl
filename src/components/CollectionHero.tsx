import { motion } from 'framer-motion';
import { isGuestCrate, type CollectionCrate } from '../lib/collectionContext';
import { CrateSwitcher } from './crates/CrateSwitcher';

interface CollectionHeroProps {
  recordCount: number;
  crates?: CollectionCrate[];
  activeCrate?: CollectionCrate | null;
  showCrateSwitcher?: boolean;
  onSelectCrate?: (crate: CollectionCrate) => void;
  onImportGuest?: () => void;
}

export function CollectionHero({
  recordCount,
  crates = [],
  activeCrate = null,
  showCrateSwitcher = false,
  onSelectCrate,
  onImportGuest,
}: CollectionHeroProps) {
  const guest = activeCrate != null && isGuestCrate(activeCrate);

  return (
    <section
      id="collection-hero"
      className="collection-hero collection-hero--desktop"
      aria-label="Your collection"
    >
      <div className="collection-hero__backdrop" aria-hidden>
        <div className="collection-hero__media">
          <img
            src="/images/collection-hero.jpg"
            alt=""
            className="collection-hero__image"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="collection-hero__grade" />
        <div className="collection-hero__vignette" />
        <div className="collection-hero__grain" />
        <div className="collection-hero__glow collection-hero__glow--accent" />
        <div className="collection-hero__glow collection-hero__glow--violet" />
      </div>

      <div className="collection-hero__copy">
        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="collection-hero__copy-inner">
          <p className="collection-hero__kicker">
            {guest ? 'Guest crate' : 'Personal crate'}
          </p>
          <h1 className="collection-hero__title">
            {guest ? activeCrate?.name ?? 'Guest crate' : 'Your collection'}
          </h1>
          <p className="collection-hero__meta">
            {recordCount > 0
              ? `${recordCount} records — filter below or search Discogs in the header.`
              : guest
                ? 'Import a public Discogs collection to demo insights, play, PDF, and labels.'
                : 'Search Discogs in the header, auto-fill BPM & Camelot keys, and build a crate that mixes itself.'}
          </p>
        </motion.div>
        {showCrateSwitcher && onSelectCrate ? (
          <div className="collection-hero__switcher">
            <CrateSwitcher
              crates={crates}
              activeCrate={activeCrate}
              onSelect={onSelectCrate}
              onImportGuest={onImportGuest}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
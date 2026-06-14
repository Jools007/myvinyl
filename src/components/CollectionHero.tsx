import { motion } from 'framer-motion';

interface CollectionHeroProps {
  recordCount: number;
}

export function CollectionHero({ recordCount }: CollectionHeroProps) {
  const countLabel =
    recordCount === 1 ? '1 record in your crate' : `${recordCount} records in your crate`;

  return (
    <section
      id="collection-hero"
      className="collection-hero relative overflow-visible sm:rounded-2xl sm:border sm:border-[var(--border)]"
      aria-label="Your collection"
    >
      <div className="collection-hero__mobile sm:hidden">
        <p className="collection-hero__mobile-kicker">Personal crate</p>
        <h1 className="collection-hero__mobile-title">Your collection</h1>
        <p className="collection-hero__mobile-meta">
          {recordCount > 0
            ? countLabel
            : 'Use the search bar above to start building your crate.'}
        </p>
      </div>

      <div
        className="collection-hero__backdrop absolute inset-0 overflow-hidden rounded-2xl hidden sm:block"
        aria-hidden
      >
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
        <div className="collection-hero__grain absolute inset-0" />
        <div className="collection-hero__glow collection-hero__glow--accent" />
        <div className="collection-hero__glow collection-hero__glow--violet" />
      </div>

      <div className="collection-hero__copy absolute inset-x-0 bottom-0 z-[1] px-5 pb-3 pt-0 sm:px-7 sm:pb-4 hidden sm:block">
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
              ? `${recordCount} records — filter below or search Discogs in the header.`
              : 'Search Discogs in the header, auto-fill BPM & Camelot keys, and build a crate that mixes itself.'}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
import { motion } from 'framer-motion';

interface CollectionHeroProps {
  recordCount: number;
}

export function CollectionHero({ recordCount }: CollectionHeroProps) {
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
          <p className="collection-hero__kicker">Personal crate</p>
          <h1 className="collection-hero__title">Your collection</h1>
          <p className="collection-hero__meta">
            {recordCount > 0
              ? `${recordCount} records — filter below or search Discogs in the header.`
              : 'Search Discogs in the header, auto-fill BPM & Camelot keys, and build a crate that mixes itself.'}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
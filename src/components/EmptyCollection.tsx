import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { MyVinylBrandMark } from './MyVinylBrandMark';

type EmptyCollectionProps = {
  onAddRecord: () => void;
};

export function EmptyCollection({ onAddRecord }: EmptyCollectionProps) {
  return (
    <motion.section
      className="empty-collection"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Empty collection"
    >
      <div className="empty-collection__visual" aria-hidden>
        <span className="empty-collection__glow" />
        <span className="empty-collection__ring" />
        <MyVinylBrandMark className="empty-collection__disc" size={72} />
      </div>

      <h2 className="empty-collection__title" style={{ fontFamily: 'var(--font-display)' }}>
        Your crate is empty
      </h2>
      <p className="empty-collection__subtitle">
        Search Discogs or scan a barcode to add your first record.
      </p>

      <button type="button" onClick={onAddRecord} className="btn-primary empty-collection__cta">
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Add your first record
      </button>
    </motion.section>
  );
}
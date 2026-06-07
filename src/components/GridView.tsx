import { AnimatePresence } from 'framer-motion';
import type { VinylRecord } from '../lib/types';
import { RecordCard } from './RecordCard';

interface GridViewProps {
  records: VinylRecord[];
  onSelect: (record: VinylRecord) => void;
  onPlay: (record: VinylRecord) => void;
}

export function GridView({ records, onSelect, onPlay }: GridViewProps) {
  return (
    <div className="collection-grid">
      <AnimatePresence mode="popLayout">
        {records.map((record, i) => (
          <RecordCard
            key={record.id}
            record={record}
            index={i}
            dense
            onClick={() => onSelect(record)}
            onPlay={() => onPlay(record)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
import { AnimatePresence } from 'framer-motion';
import type { VinylRecord } from '../lib/types';
import { RecordCard } from './RecordCard';

interface GridViewProps {
  records: VinylRecord[];
  onPlay: (record: VinylRecord) => void;
}

export function GridView({ records, onPlay }: GridViewProps) {
  return (
    <div className="collection-grid-view min-w-0 overflow-x-hidden">
      <div className="collection-grid">
        <AnimatePresence mode="popLayout">
          {records.map((record, i) => (
            <RecordCard
              key={record.id}
              record={record}
              index={i}
              dense
              onPlay={() => onPlay(record)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
import { AnimatePresence } from 'framer-motion';
import type { VinylRecord } from '../lib/types';
import { RecordCard } from './RecordCard';

interface GridViewProps {
  records: VinylRecord[];
  onPlay: (record: VinylRecord) => void;
}

const LARGE_GRID_THRESHOLD = 120;

export function GridView({ records, onPlay }: GridViewProps) {
  const useMotion = records.length <= LARGE_GRID_THRESHOLD;

  return (
    <div className="collection-grid-view min-w-0 overflow-x-hidden">
      <div className="collection-grid">
        {useMotion ? (
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
        ) : (
          records.map((record, i) => (
            <RecordCard
              key={record.id}
              record={record}
              index={i}
              dense
              onPlay={() => onPlay(record)}
            />
          ))
        )}
      </div>
    </div>
  );
}
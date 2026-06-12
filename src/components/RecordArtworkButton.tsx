import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { openRecordDetail } from '../lib/recordDetail';
import type { VinylRecord } from '../lib/types';

type RecordArtworkButtonProps = {
  record: VinylRecord;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function RecordArtworkButton({
  record,
  children,
  className = '',
  ariaLabel,
}: RecordArtworkButtonProps) {
  const label = ariaLabel ?? `View ${record.title} by ${record.artist}`;

  const stop = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <button
      type="button"
      className={className}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        openRecordDetail(record);
      }}
      aria-label={label}
    >
      {children}
    </button>
  );
}
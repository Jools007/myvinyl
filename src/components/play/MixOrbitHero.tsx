import { openRecordDetail } from '../../lib/recordDetail';
import type { VinylRecord } from '../../lib/types';
import { RecordArtwork } from '../RecordArtwork';

export type MixOrbitHeroProps = {
  record: VinylRecord;
  trackTitle: string;
  spinning: boolean;
  spinDurationSec?: number;
  dropTarget?: boolean;
};

export function MixOrbitHero({
  record,
  trackTitle,
  spinning,
  spinDurationSec,
  dropTarget = false,
}: MixOrbitHeroProps) {
  return (
    <div
      className={`mix-orbit__hero-anchor${dropTarget ? ' mix-orbit__hero-anchor--drop' : ''}`}
      aria-hidden={false}
    >
      <div className="mix-orbit__hero">
        <div className="mix-orbit__hero-aura" />
        <div className="mix-orbit__hero-glow" />
        <div className="mix-orbit__hero-ring" aria-hidden />
        <button
          type="button"
          className={`mix-orbit__hero-disc play-dj__disc play-dj__disc-btn${spinning ? ' play-dj__disc--active' : ''}`}
          onClick={() => openRecordDetail(record)}
          aria-label={`Now playing — ${trackTitle} by ${record.artist}`}
        >
          <div
            className={`play-dj__disc-rotor${spinning ? ' play-dj__disc-rotor--spinning' : ''}`}
            style={
              spinning && spinDurationSec != null
                ? { animationDuration: `${spinDurationSec}s` }
                : undefined
            }
          >
            <RecordArtwork
              src={record.coverUrl}
              title={record.title}
              size="now"
              className="play-dj__cover play-dj__cover--now"
            />
            <span className="play-dj__disc-grooves" aria-hidden />
            <span className="play-dj__disc-sheen" aria-hidden />
          </div>
          <span className="play-dj__disc-spindle" aria-hidden />
        </button>
      </div>
    </div>
  );
}
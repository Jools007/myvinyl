import { Dices, Route, Shuffle } from 'lucide-react';
import type { RouletteBias } from '../../lib/insightInteractions';

type PlayfulToolsProps = {
  onRoulette: (bias: RouletteBias) => void;
  onBuildJourney: () => void;
  canBuildJourney: boolean;
  spinning?: boolean;
};

export function PlayfulTools({
  onRoulette,
  onBuildJourney,
  canBuildJourney,
  spinning = false,
}: PlayfulToolsProps) {
  return (
    <div className="insights-playful">
      <p className="insights-playful__label">Crate dig tools</p>
      <div className="insights-playful__grid">
        <button
          type="button"
          className="insights-playful__card"
          onClick={() => onRoulette('any')}
          disabled={spinning}
        >
          <span className="insights-playful__icon" aria-hidden>
            <Dices className="h-4 w-4" />
          </span>
          <span className="insights-playful__title">Crate roulette</span>
          <span className="insights-playful__desc">Random pick from your shelf</span>
        </button>
        <button
          type="button"
          className="insights-playful__card"
          onClick={() => onRoulette('unplayed')}
          disabled={spinning}
        >
          <span className="insights-playful__icon insights-playful__icon--violet" aria-hidden>
            <Shuffle className="h-4 w-4" />
          </span>
          <span className="insights-playful__title">Unplayed dig</span>
          <span className="insights-playful__desc">Something you haven&apos;t spun</span>
        </button>
        <button
          type="button"
          className={`insights-playful__card insights-playful__card--wide${!canBuildJourney ? ' insights-playful__card--disabled' : ''}`}
          onClick={onBuildJourney}
          disabled={!canBuildJourney}
        >
          <span className="insights-playful__icon insights-playful__icon--coral" aria-hidden>
            <Route className="h-4 w-4" />
          </span>
          <span className="insights-playful__title">Build a set</span>
          <span className="insights-playful__desc">
            Chain 4 tracks by key &amp; tempo — warm-up to landing
          </span>
        </button>
      </div>
    </div>
  );
}
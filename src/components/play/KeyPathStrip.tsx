import type { KeyPathStep } from '../../lib/sessionCrate';

type KeyPathStripProps = {
  steps: KeyPathStep[];
};

export function KeyPathStrip({ steps }: KeyPathStripProps) {
  if (steps.length < 2) return null;

  return (
    <div className="play-crate__path" aria-label="Key path through crate">
      <p className="play-crate__path-label">Key path</p>
      <div className="play-crate__path-track">
        {steps.map((step, index) => (
          <span key={`${step.label}-${index}`} className="play-crate__path-step">
            {index > 0 ? (
              <span className="play-crate__path-arrow" aria-hidden>
                →
              </span>
            ) : null}
            <span className="play-crate__path-chip tabular-nums">
              <span className="play-crate__path-code">{step.code}</span>
              {step.bpm != null ? (
                <span className="play-crate__path-bpm">{step.bpm}</span>
              ) : null}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
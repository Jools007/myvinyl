import type { KeyPathStep } from '../../lib/sessionCrate';

type KeyPathStripProps = {
  steps: KeyPathStep[];
  variant?: 'card' | 'inline';
};

export function KeyPathStrip({ steps, variant = 'card' }: KeyPathStripProps) {
  if (steps.length < 2) return null;

  return (
    <div
      className={variant === 'inline' ? 'play-set__path' : 'play-crate__path'}
      aria-label="Key path through set"
    >
      <p className={variant === 'inline' ? 'play-set__path-label' : 'play-crate__path-label'}>
        Key path
      </p>
      <div
        className={variant === 'inline' ? 'play-set__path-track' : 'play-crate__path-track'}
      >
        {steps.map((step, index) => (
          <span key={`${step.label}-${index}`} className="play-set__path-step">
            {index > 0 ? (
              <span className="play-set__path-arrow" aria-hidden>
                →
              </span>
            ) : null}
            <span className="play-set__path-chip tabular-nums" title={step.label}>
              <span className="play-set__path-code">{step.code}</span>
              {step.bpm != null ? (
                <span className="play-set__path-bpm">{step.bpm}</span>
              ) : null}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
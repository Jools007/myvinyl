import { buildCrateLabelContent } from '../../lib/labelContent';
import type { VinylRecord } from '../../lib/types';

export type CrateLabelSize = 'preview' | 'print';

interface CrateLabelProps {
  record: VinylRecord;
  size?: CrateLabelSize;
  /** Live override for label notes (modal editor). */
  descriptionOverride?: string;
  /** Live override for vibe tags on the primary track (modal editor). */
  vibesOverride?: string[];
  className?: string;
  onClick?: () => void;
}

export function CrateLabel({
  record,
  size = 'preview',
  descriptionOverride,
  vibesOverride,
  className = '',
  onClick,
}: CrateLabelProps) {
  const useDraft =
    descriptionOverride !== undefined || vibesOverride !== undefined;
  const data = buildCrateLabelContent(
    record,
    useDraft
      ? {
          description: descriptionOverride,
          useDescriptionDraft: descriptionOverride !== undefined,
          vibes: vibesOverride,
          useVibesDraft: vibesOverride !== undefined,
        }
      : undefined
  );
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';

  const bpmText =
    data.bpm != null ? `${data.bpmEstimated ? '~' : ''}${data.bpm}` : '—';
  const keyText = data.camelot ?? '—';
  const hasDesc = Boolean(data.description.trim());
  const showPlaceholder = !hasDesc && size !== 'print';

  const railMeta = [data.format, data.year].filter(Boolean).join(' · ');

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`crate-label crate-label--${size}${interactive ? ' crate-label--interactive' : ''} ${className}`.trim()}
      aria-label={
        interactive
          ? `Inspect label for ${data.artist}, ${data.album}`
          : undefined
      }
    >
      <div className="crate-label__surface">
        <div className="crate-label__identity">
          <h3 className="crate-label__artist" title={data.artist}>
            {data.artist}
          </h3>
          <p className="crate-label__album" title={data.album}>
            {data.album}
          </p>
        </div>

        <div className="crate-label__mix" aria-label="BPM and key">
          <div className="crate-label__stat">
            <span className="crate-label__stat-label">BPM</span>
            <span className="crate-label__stat-value tabular-nums">{bpmText}</span>
          </div>
          <div className="crate-label__stat">
            <span className="crate-label__stat-label">Key</span>
            <span className="crate-label__stat-value crate-label__stat-value--key tabular-nums">
              {keyText}
              {data.keyEstimated && data.camelot ? (
                <span className="crate-label__est" aria-hidden>
                  ~
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {data.vibes.length > 0 ? (
          <ul className="crate-label__vibes" aria-label="Vibe tags">
            {data.vibes.map((v) => (
              <li key={v} className="crate-label__vibe">
                {v}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="crate-label__desc-block">
          {hasDesc ? (
            <p className="crate-label__desc" title={data.description}>
              {data.description}
            </p>
          ) : showPlaceholder ? (
            <p className="crate-label__desc crate-label__desc--placeholder">
              Add notes in preview…
            </p>
          ) : null}
        </div>

        <footer className="crate-label__rail" aria-label="Label footer">
          <span className="crate-label__brand">MyVinyl</span>
          {railMeta ? (
            <span className="crate-label__rail-meta">{railMeta}</span>
          ) : null}
        </footer>
      </div>
    </Tag>
  );
}
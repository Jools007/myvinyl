import { buildCrateLabelContent } from '../../lib/labelContent';
import type { LabelDisplayPrefs, VinylRecord } from '../../lib/types';

export type CrateLabelSize = 'preview' | 'print';

interface CrateLabelProps {
  record: VinylRecord;
  size?: CrateLabelSize;
  /** Live override for label notes (modal editor). */
  descriptionOverride?: string;
  /** Live override for vibe tags on the primary track (modal editor). */
  vibesOverride?: string[];
  /** Live override for title layout and field visibility (modal editor). */
  displayOverride?: LabelDisplayPrefs;
  className?: string;
  onClick?: () => void;
}

export function CrateLabel({
  record,
  size = 'preview',
  descriptionOverride,
  vibesOverride,
  displayOverride,
  className = '',
  onClick,
}: CrateLabelProps) {
  const useDraft =
    descriptionOverride !== undefined ||
    vibesOverride !== undefined ||
    displayOverride !== undefined;
  const data = buildCrateLabelContent(
    record,
    useDraft
      ? {
          description: descriptionOverride,
          useDescriptionDraft: descriptionOverride !== undefined,
          vibes: vibesOverride,
          useVibesDraft: vibesOverride !== undefined,
          display: displayOverride,
          useDisplayDraft: displayOverride !== undefined,
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
  const identityLines =
    data.titleLayout === 'album-only'
      ? [{ key: 'album', text: data.album, className: 'crate-label__album crate-label__album--solo' }]
      : data.titleLayout === 'album-artist'
        ? [
            { key: 'album', text: data.album, className: 'crate-label__album crate-label__album--lead' },
            { key: 'artist', text: data.artist, className: 'crate-label__artist crate-label__artist--sub' },
          ]
        : [
            { key: 'artist', text: data.artist, className: 'crate-label__artist' },
            { key: 'album', text: data.album, className: 'crate-label__album' },
          ];
  const showMix = data.showBpm || data.showKey;

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
          {identityLines.map((line) =>
            line.key === 'artist' ? (
              <h3 key={line.key} className={line.className} title={line.text}>
                {line.text}
              </h3>
            ) : (
              <p key={line.key} className={line.className} title={line.text}>
                {line.text}
              </p>
            )
          )}
        </div>

        {showMix ? (
          <div className="crate-label__mix" aria-label="BPM and key">
            {data.showBpm ? (
              <div className="crate-label__stat">
                <span className="crate-label__stat-label">BPM</span>
                <span className="crate-label__stat-value tabular-nums">{bpmText}</span>
              </div>
            ) : null}
            {data.showKey ? (
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
            ) : null}
          </div>
        ) : null}

        {data.showVibes && data.vibes.length > 0 ? (
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
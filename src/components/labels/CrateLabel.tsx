import { useBaseAlbumDescription } from '../../hooks/useBaseAlbumDescription';
import { buildCrateLabelContent, clampLabelDescription } from '../../lib/labelContent';
import type { LabelDisplayPrefs, VinylRecord } from '../../lib/types';

export type CrateLabelSize = 'preview' | 'print' | 'thermal-preview';

interface CrateLabelProps {
  record: VinylRecord;
  size?: CrateLabelSize;
  /** Live override for label notes (modal editor). */
  descriptionOverride?: string;
  /** Pre-resolved default sticker copy from parent (skips fetch hook when set). */
  baseDescriptionOverride?: string;
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
  baseDescriptionOverride,
  vibesOverride,
  displayOverride,
  className = '',
  onClick,
}: CrateLabelProps) {
  const fetched = useBaseAlbumDescription(
    baseDescriptionOverride != null && baseDescriptionOverride !== '' ? null : record
  );
  const albumBase = clampLabelDescription(
    (baseDescriptionOverride ?? fetched.baseDescription).trim()
  );
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
          baseDescription: albumBase,
        }
      : { baseDescription: albumBase }
  );
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';

  const isThermal = size === 'thermal-preview';
  const bpmText =
    data.bpm != null ? `${data.bpmEstimated ? '~' : ''}${data.bpm}` : '—';
  const keyText = data.camelot ?? '—';
  const notesText = data.description;
  const hasDesc = Boolean(notesText.trim());

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

  const identityBlock = (
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
  );

  const thermalMixParts: string[] = [];
  if (isThermal && showMix) {
    if (data.showBpm) thermalMixParts.push(`${bpmText} BPM`);
    if (data.showKey) {
      const keyPart = `${keyText} KEY${data.keyEstimated && data.camelot ? '~' : ''}`;
      thermalMixParts.push(keyPart);
    }
  }

  const mixBlock = showMix ? (
    <div
      className={`crate-label__mix${isThermal ? ' crate-label__mix--thermal' : ''}`}
      aria-label="BPM and key"
    >
      {isThermal ? (
        <p className="crate-label__mix-inline tabular-nums">{thermalMixParts.join(' · ')}</p>
      ) : (
        <>
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
        </>
      )}
    </div>
  ) : null;

  const labelBody = (
    <>
      {identityBlock}
      {mixBlock}

      {data.showVibes && data.vibes.length > 0 ? (
        isThermal ? (
          <p className="crate-label__vibes-line" aria-label="Vibe tags">
            {data.vibes.join(' · ')}
          </p>
        ) : (
          <ul className="crate-label__vibes" aria-label="Vibe tags">
            {data.vibes.map((v) => (
              <li key={v} className="crate-label__vibe">
                {v}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {hasDesc ? (
        <div className="crate-label__desc-block">
          <p className="crate-label__desc" title={notesText}>
            {notesText}
          </p>
        </div>
      ) : null}
    </>
  );

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
        {isThermal ? (
          <div className="crate-label__thermal-stack">{labelBody}</div>
        ) : (
          labelBody
        )}

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
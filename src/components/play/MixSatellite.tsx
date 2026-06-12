import {
  ORBIT_GLYPH_CHAR,
  ORBIT_GLYPH_LABEL,
  formatOrbitBpmDelta,
  orbitBpmDelta,
  type OrbitSatellite,
} from '../../lib/orbit';
import { resolveTrackCamelot } from '../../lib/camelot';
import { openRecordDetail } from '../../lib/recordDetail';
import type { ResolvedPlaySelection } from '../../lib/playSession';
import { RecordArtwork } from '../RecordArtwork';

export type MixSatelliteProps = {
  satellite: OrbitSatellite;
  anchor: ResolvedPlaySelection | null;
  hovered: boolean;
  dragging: boolean;
  dimmed: boolean;
  landing: boolean;
  staggerIndex: number;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
};

export function MixSatellite({
  satellite,
  anchor,
  hovered,
  dragging,
  dimmed,
  landing,
  onHoverStart,
  onHoverEnd,
}: MixSatelliteProps) {
  const { record, track, ring, ringTone, glyph, isForgottenGem } = satellite;
  const keyCode = resolveTrackCamelot(track).code;
  const bpmLine = formatOrbitBpmDelta(orbitBpmDelta(anchor, track));

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openRecordDetail(record);
  };

  return (
    <div
      className={[
        'mix-orbit__satellite',
        `mix-orbit__satellite--${ring}`,
        `mix-orbit__satellite--tone-${ringTone}`,
        hovered ? 'mix-orbit__satellite--hovered' : '',
        dragging ? 'mix-orbit__satellite--dragging' : '',
        dimmed ? 'mix-orbit__satellite--dimmed' : '',
        landing ? 'mix-orbit__satellite--landing' : '',
        isForgottenGem ? 'mix-orbit__satellite--gem' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={handleContextMenu}
      onMouseEnter={dragging ? undefined : onHoverStart}
      onMouseLeave={dragging ? undefined : onHoverEnd}
      role="option"
      aria-label={`${track.title} by ${record.artist}`}
      aria-selected={hovered || dragging}
    >
      {hovered && !dragging ? (
        <span className="mix-orbit__satellite-hover-ring" aria-hidden />
      ) : null}
      {dragging ? <span className="mix-orbit__satellite-drag-ring" aria-hidden /> : null}
      <span
        className={`mix-orbit__satellite-rotor${ring === 'inner' || hovered || dragging ? ' mix-orbit__satellite-rotor--spin' : ''}`}
      >
        <RecordArtwork
          src={record.coverUrl}
          title={record.title}
          fill
          className="mix-orbit__cover"
        />
        <span className="mix-orbit__grooves" aria-hidden />
        <span className="mix-orbit__sheen" aria-hidden />
        <span
          className={`mix-orbit__compat-ring mix-orbit__compat-ring--${ringTone}`}
          aria-hidden
        />
      </span>
      <span className="mix-orbit__glyph" aria-hidden>
        {ORBIT_GLYPH_CHAR[glyph]}
      </span>
      {hovered && !dragging ? (
        <span className="mix-orbit__satellite-tip" role="tooltip">
          <span className="mix-orbit__satellite-tip-whisper">
            {ORBIT_GLYPH_LABEL[glyph]}
            {keyCode ? ` · ${keyCode}` : ''}
            {bpmLine ? ` · ${bpmLine}` : ''}
          </span>
          <span className="mix-orbit__satellite-tip-title">{track.title}</span>
          <span className="mix-orbit__satellite-tip-artist">{record.artist}</span>
          <span className="mix-orbit__satellite-tip-hint">Drag to the platter</span>
        </span>
      ) : null}
    </div>
  );
}
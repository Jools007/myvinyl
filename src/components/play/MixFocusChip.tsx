import { motion, AnimatePresence } from 'framer-motion';
import { resolveTrackCamelot } from '../../lib/camelot';
import {
  ORBIT_GLYPH_CHAR,
  ORBIT_GLYPH_LABEL,
  formatOrbitBpmDelta,
  orbitBpmDelta,
  type OrbitSatellite,
} from '../../lib/orbit';
import type { ResolvedPlaySelection } from '../../lib/playSession';

export type MixFocusChipProps = {
  satellite: OrbitSatellite | null;
  anchor: ResolvedPlaySelection | null;
};

export function MixFocusChip({ satellite, anchor }: MixFocusChipProps) {
  const keyCode = satellite ? resolveTrackCamelot(satellite.track).code : undefined;
  const bpmLine = satellite ? formatOrbitBpmDelta(orbitBpmDelta(anchor, satellite.track)) : null;
  const vibe =
    satellite?.track.vibeTags?.[0] ?? satellite?.record.genres[0] ?? null;

  return (
    <AnimatePresence mode="wait">
      {satellite ? (
        <motion.div
          key={satellite.key}
          className={`mix-orbit__chip mix-orbit__chip--${satellite.ring}`}
          role="status"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mix-orbit__chip-whisper">
            <span className="mix-orbit__chip-glyph" aria-hidden>
              {ORBIT_GLYPH_CHAR[satellite.glyph]}
            </span>
            <span>{ORBIT_GLYPH_LABEL[satellite.glyph]}</span>
            {keyCode ? (
              <>
                <span className="mix-orbit__chip-sep" aria-hidden>
                  ·
                </span>
                <span className="mix-orbit__chip-key font-mono">{keyCode}</span>
              </>
            ) : null}
            {bpmLine ? (
              <>
                <span className="mix-orbit__chip-sep" aria-hidden>
                  ·
                </span>
                <span className="mix-orbit__chip-bpm tabular-nums">{bpmLine}</span>
              </>
            ) : null}
            {vibe ? (
              <span className="mix-orbit__chip-vibe">{vibe}</span>
            ) : null}
          </p>
          <p className="mix-orbit__chip-title">{satellite.track.title}</p>
          <p className="mix-orbit__chip-artist">
            {satellite.record.artist}
            <span className="mix-orbit__chip-album">
              {' '}
              — {satellite.record.title}
            </span>
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
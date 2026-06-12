import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  assignOrbitLayout,
  orbitDiscSpinSec,
  type OrbitSatellite,
} from '../../lib/orbit';
import { playSelectionKey, type PlaySelection, type ResolvedPlaySelection } from '../../lib/playSession';
import type { Track, VinylRecord } from '../../lib/types';
import { MixFocusChip } from './MixFocusChip';
import { MixOrbitField } from './MixOrbitField';
import { MixSpinButton } from './MixSpinButton';

const LANDING_MS = 520;

export type MixOrbitViewProps = {
  collection: VinylRecord[];
  anchor: ResolvedPlaySelection | null;
  queue: ResolvedPlaySelection[];
  mixTrail: PlaySelection[];
  heroSpinning: boolean;
  heroSpinDurationSec: number;
  onMixTrailAppend: (entry: PlaySelection) => void;
  onPlayNow: (record: VinylRecord, track: Track) => void;
  onSelectionChange?: (satellite: OrbitSatellite | null, discSpinSec: number) => void;
};

export function MixOrbitView({
  collection,
  anchor,
  queue,
  mixTrail,
  heroSpinning,
  heroSpinDurationSec,
  onMixTrailAppend,
  onPlayNow,
  onSelectionChange,
}: MixOrbitViewProps) {
  const mobile = useIsMobile();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [landingKey, setLandingKey] = useState<string | null>(null);
  const [isLanding, setIsLanding] = useState(false);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueExclude = useMemo(
    () =>
      queue.map((q) => ({
        recordId: q.record.id,
        trackId: q.track.id,
      })),
    [queue]
  );

  const layout = useMemo(
    () =>
      assignOrbitLayout({
        collection,
        anchor,
        mixTrail,
        exclude: queueExclude,
        mobile,
      }),
    [collection, anchor, mixTrail, queueExclude, mobile]
  );

  const focusKey = draggingKey ?? hoveredKey;
  const focusSatellite = useMemo(
    () => layout.satellites.find((s) => s.key === focusKey) ?? null,
    [layout.satellites, focusKey]
  );

  useEffect(() => {
    const spinSec = orbitDiscSpinSec(
      anchor,
      focusSatellite?.track ?? anchor?.track ?? ({} as Track)
    );
    onSelectionChange?.(focusSatellite, spinSec);
  }, [focusSatellite, anchor, onSelectionChange]);

  useEffect(
    () => () => {
      if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    },
    []
  );

  const isLandingRef = useRef(false);
  isLandingRef.current = isLanding;

  const cuePlay = useCallback(
    (satellite: OrbitSatellite) => {
      if (isLandingRef.current) return;

      const nowKey = anchor
        ? playSelectionKey({ recordId: anchor.record.id, trackId: anchor.track.id })
        : null;
      if (nowKey && satellite.key === nowKey) return;

      setLandingKey(satellite.key);
      setIsLanding(true);
      setDraggingKey(null);
      setHoveredKey(null);

      if (anchor) {
        onMixTrailAppend({
          recordId: anchor.record.id,
          trackId: anchor.track.id,
        });
      }

      landingTimerRef.current = setTimeout(() => {
        onPlayNow(satellite.record, satellite.track);
        setLandingKey(null);
        setIsLanding(false);
      }, LANDING_MS);
    },
    [anchor, onMixTrailAppend, onPlayNow]
  );

  const satellitesRef = useRef(layout.satellites);
  satellitesRef.current = layout.satellites;

  const handleDropToCenter = useCallback(
    (key: string) => {
      const satellite = satellitesRef.current.find((s) => s.key === key);
      if (satellite) cuePlay(satellite);
    },
    [cuePlay]
  );

  const handleSpinButton = useCallback(() => {
    if (focusSatellite) cuePlay(focusSatellite);
  }, [focusSatellite, cuePlay]);

  return (
    <motion.section
      className="mix-orbit"
      aria-label="Mix orbit"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {layout.coldStart && !anchor ? (
        <p className="mix-orbit__cold-copy">Drop a needle to start — pick a starter from your crate.</p>
      ) : null}

      <div className="mix-orbit__stage">
        <MixOrbitField
          satellites={layout.satellites}
          anchor={anchor}
          mobile={mobile}
          hoveredKey={hoveredKey}
          landingKey={landingKey}
          draggingKey={draggingKey}
          coldStart={layout.coldStart}
          heroSpinning={heroSpinning}
          heroSpinDurationSec={heroSpinDurationSec}
          isLanding={isLanding}
          onHoverChange={setHoveredKey}
          onDragChange={setDraggingKey}
          onDropToCenter={handleDropToCenter}
        />
      </div>

      <div className="mix-orbit__deck">
        <MixFocusChip satellite={focusSatellite} anchor={anchor} />
        <MixSpinButton
          disabled={!focusSatellite || isLanding}
          loading={isLanding}
          onClick={handleSpinButton}
        />
        {isLanding ? (
          <p className="mix-orbit__hint">Cueing your next track…</p>
        ) : draggingKey ? (
          <p className="mix-orbit__hint">Drop on the platter to spin it</p>
        ) : focusSatellite ? (
          <p className="mix-orbit__hint">Drag onto the platter — or press Spin it</p>
        ) : (
          <p className="mix-orbit__hint">Hover for mix info · drag a sleeve onto the platter</p>
        )}
      </div>
    </motion.section>
  );
}
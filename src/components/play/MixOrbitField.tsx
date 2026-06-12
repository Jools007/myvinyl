import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ORBIT_RADIUS_PX,
  orbitRadiusForRing,
  polarToPosition,
  type OrbitSatellite,
} from '../../lib/orbit';
import type { ResolvedPlaySelection } from '../../lib/playSession';
import { MixOrbitHero } from './MixOrbitHero';
import { MixSatelliteSlot } from './MixSatelliteSlot';

export type MixOrbitFieldProps = {
  satellites: OrbitSatellite[];
  anchor: ResolvedPlaySelection | null;
  mobile: boolean;
  hoveredKey: string | null;
  landingKey: string | null;
  draggingKey: string | null;
  coldStart: boolean;
  heroSpinning: boolean;
  heroSpinDurationSec: number;
  isLanding: boolean;
  onHoverChange: (key: string | null) => void;
  onDragChange: (key: string | null) => void;
  onDropToCenter: (key: string) => void;
};

type FieldMetrics = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const SATELLITE_PAD_PX = 28;

function fieldMinSize(outerRadius: number): number {
  return (outerRadius + SATELLITE_PAD_PX) * 2;
}

export function MixOrbitField({
  satellites,
  anchor,
  mobile,
  hoveredKey,
  landingKey,
  draggingKey,
  coldStart,
  heroSpinning,
  heroSpinDurationSec,
  isLanding,
  onHoverChange,
  onDragChange,
  onDropToCenter,
}: MixOrbitFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<FieldMetrics | null>(null);

  const radii = mobile ? ORBIT_RADIUS_PX.mobile : ORBIT_RADIUS_PX.desktop;
  const minSize = fieldMinSize(radii.outer);

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setMetrics({
        width: rect.width,
        height: rect.height,
        centerX: rect.width / 2,
        centerY: rect.height / 2,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mobile, satellites.length, minSize]);

  const ringGuides = useMemo(
    () => [
      { ring: 'inner' as const, r: radii.inner },
      { ring: 'mid' as const, r: radii.mid },
      { ring: 'outer' as const, r: radii.outer },
    ],
    [radii]
  );

  const focusSatellite =
    satellites.find((s) => s.key === draggingKey) ??
    satellites.find((s) => s.key === hoveredKey) ??
    null;

  const litRing = focusSatellite?.ring ?? null;

  return (
    <div
      ref={fieldRef}
      className={[
        'mix-orbit__field',
        mobile ? 'mix-orbit__field--mobile' : '',
        coldStart ? 'mix-orbit__field--cold' : '',
        anchor ? 'mix-orbit__field--anchored' : '',
        draggingKey ? 'mix-orbit__field--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ minHeight: minSize, minWidth: minSize }}
      role="listbox"
      aria-label="Mix suggestions orbiting now playing"
    >
      <div className="mix-orbit__field-bg" aria-hidden />
      <div className="mix-orbit__field-stars" aria-hidden />

      {metrics ? (
        <svg
          className="mix-orbit__rings"
          width={metrics.width}
          height={metrics.height}
          aria-hidden
        >
          <defs>
            <radialGradient id="mix-orbit-hub-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.18" />
              <stop offset="45%" stopColor="#d4a24a" stopOpacity="0.06" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            className="mix-orbit__hub-glow"
            cx={metrics.centerX}
            cy={metrics.centerY}
            r={radii.inner * 0.95}
            fill="url(#mix-orbit-hub-glow)"
          />
          {ringGuides.map(({ ring, r }) => (
            <circle
              key={ring}
              className={[
                'mix-orbit__ring',
                `mix-orbit__ring--${ring}`,
                litRing === ring ? 'mix-orbit__ring--lit' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              cx={metrics.centerX}
              cy={metrics.centerY}
              r={r}
            />
          ))}
          {focusSatellite && focusSatellite.key !== draggingKey
            ? (() => {
                const radius = orbitRadiusForRing(focusSatellite.ring, mobile);
                const { x, y } = polarToPosition(focusSatellite.angleDeg, radius, {
                  x: metrics.centerX,
                  y: metrics.centerY,
                });
                return (
                  <line
                    className="mix-orbit__spoke mix-orbit__spoke--hover"
                    x1={metrics.centerX}
                    y1={metrics.centerY}
                    x2={x}
                    y2={y}
                  />
                );
              })()
            : null}
        </svg>
      ) : null}

      {metrics && draggingKey ? (
        <div
          className="mix-orbit__drop-zone"
          aria-hidden
          style={{
            left: metrics.centerX,
            top: metrics.centerY,
            width: mobile ? 220 : 260,
            height: mobile ? 220 : 260,
          }}
        />
      ) : null}

      {anchor ? (
        <MixOrbitHero
          record={anchor.record}
          trackTitle={anchor.track.title}
          spinning={heroSpinning}
          spinDurationSec={heroSpinDurationSec}
          dropTarget={Boolean(draggingKey)}
        />
      ) : null}

      {metrics
        ? satellites.map((satellite) => {
            const hovered = hoveredKey === satellite.key;
            const dimmed = Boolean(hoveredKey && hoveredKey !== satellite.key);
            const landing = landingKey === satellite.key;

            return (
              <MixSatelliteSlot
                key={satellite.key}
                satellite={satellite}
                anchor={anchor}
                fieldRef={fieldRef}
                metrics={metrics}
                mobile={mobile}
                hovered={hovered}
                dimmed={dimmed}
                landing={landing}
                disabled={isLanding}
                onHoverStart={() => onHoverChange(satellite.key)}
                onHoverEnd={() => {
                  if (hoveredKey === satellite.key) onHoverChange(null);
                }}
                onDragActiveChange={onDragChange}
                onDropToCenter={onDropToCenter}
              />
            );
          })
        : null}

      {!satellites.length ? (
        <motion.p
          className="mix-orbit__empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          No matches in your crate yet — enrich more records or switch to Queue.
        </motion.p>
      ) : null}
    </div>
  );
}
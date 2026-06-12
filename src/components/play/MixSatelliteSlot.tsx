import { animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { orbitRadiusForRing, polarToPosition, type OrbitSatellite } from '../../lib/orbit';
import type { ResolvedPlaySelection } from '../../lib/playSession';
import { MixSatellite } from './MixSatellite';

const SNAP_SPRING = { type: 'spring' as const, stiffness: 380, damping: 34 };

type MixSatelliteSlotProps = {
  satellite: OrbitSatellite;
  anchor: ResolvedPlaySelection | null;
  fieldRef: React.RefObject<HTMLDivElement | null>;
  metrics: { centerX: number; centerY: number };
  mobile: boolean;
  hovered: boolean;
  dimmed: boolean;
  landing: boolean;
  disabled: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onDragActiveChange: (key: string | null) => void;
  onDropToCenter: (key: string) => void;
};

function dropRadiusPx(mobile: boolean): number {
  return mobile ? 110 : 130;
}

export function MixSatelliteSlot({
  satellite,
  anchor,
  fieldRef,
  metrics,
  mobile,
  hovered,
  dimmed,
  landing,
  disabled,
  onHoverStart,
  onHoverEnd,
  onDragActiveChange,
  onDropToCenter,
}: MixSatelliteSlotProps) {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const [nearPlatter, setNearPlatter] = useState(false);
  const draggingRef = useRef(false);
  const pointerOrigin = useRef({ x: 0, y: 0 });
  const radius = orbitRadiusForRing(satellite.ring, mobile);
  const orbitCenter = polarToPosition(satellite.angleDeg, radius, {
    x: metrics.centerX,
    y: metrics.centerY,
  });

  const checkNearPlatter = useCallback(
    (ox: number, oy: number) => {
      const dx = orbitCenter.x + ox - metrics.centerX;
      const dy = orbitCenter.y + oy - metrics.centerY;
      return Math.hypot(dx, dy) < dropRadiusPx(mobile);
    },
    [orbitCenter.x, orbitCenter.y, metrics.centerX, metrics.centerY, mobile]
  );

  useMotionValueEvent(dragX, 'change', (ox) => {
    if (!draggingRef.current) return;
    setNearPlatter(checkNearPlatter(ox, dragY.get()));
  });

  useMotionValueEvent(dragY, 'change', (oy) => {
    if (!draggingRef.current) return;
    setNearPlatter(checkNearPlatter(dragX.get(), oy));
  });

  const snapHome = useCallback(() => {
    void animate(dragX, 0, SNAP_SPRING);
    void animate(dragY, 0, SNAP_SPRING);
    setNearPlatter(false);
  }, [dragX, dragY]);

  const isOverPlatterClient = useCallback(
    (clientX: number, clientY: number): boolean => {
      const field = fieldRef.current;
      if (!field) return false;
      const rect = field.getBoundingClientRect();
      return (
        Math.hypot(
          clientX - (rect.left + metrics.centerX),
          clientY - (rect.top + metrics.centerY)
        ) < dropRadiusPx(mobile)
      );
    },
    [fieldRef, metrics.centerX, metrics.centerY, mobile]
  );

  const endDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      setNearPlatter(false);
      fieldRef.current?.removeAttribute('data-dragging');
      onDragActiveChange(null);

      const dropped =
        isOverPlatterClient(clientX, clientY) ||
        checkNearPlatter(dragX.get(), dragY.get());

      if (dropped) {
        onDropToCenter(satellite.key);
        return;
      }

      snapHome();
    },
    [
      checkNearPlatter,
      dragX,
      dragY,
      fieldRef,
      isOverPlatterClient,
      onDragActiveChange,
      onDropToCenter,
      satellite.key,
      snapHome,
    ]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || landing || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    draggingRef.current = true;
    setIsDragging(true);
    pointerOrigin.current = { x: e.clientX, y: e.clientY };
    dragX.set(0);
    dragY.set(0);
    fieldRef.current?.setAttribute('data-dragging', 'true');
    onDragActiveChange(satellite.key);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    dragX.set(e.clientX - pointerOrigin.current.x);
    dragY.set(e.clientY - pointerOrigin.current.y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    endDrag(e.clientX, e.clientY);
  };

  return (
    <div
      className={[
        'mix-orbit__satellite-slot',
        `mix-orbit__satellite-slot--${satellite.ring}`,
        isDragging ? 'mix-orbit__satellite-slot--dragging' : '',
        nearPlatter ? 'mix-orbit__satellite-slot--near-platter' : '',
        hovered ? 'mix-orbit__satellite-slot--hovered' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: orbitCenter.x,
        top: orbitCenter.y,
        zIndex: isDragging ? 25 : hovered ? 10 : satellite.ring === 'inner' ? 8 : satellite.ring === 'mid' ? 7 : 6,
      }}
    >
      <motion.div
        className="mix-orbit__satellite-drag"
        style={{ x: dragX, y: dragY, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <MixSatellite
          satellite={satellite}
          anchor={anchor}
          hovered={hovered}
          dragging={isDragging}
          dimmed={dimmed}
          landing={landing}
          staggerIndex={satellite.rank}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
        />
      </motion.div>
    </div>
  );
}
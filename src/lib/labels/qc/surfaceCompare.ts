import { analyzeThermalLabelSurface, type RgbaSurface } from './thermalLabelQc';

export interface SurfaceQcDelta {
  inkPixels: number;
  inkDelta: number;
  borderDeltas: Record<'top' | 'right' | 'bottom' | 'left', number>;
  boundsDelta: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}

/** Numeric diff of QC metrics between two 1-bit label surfaces. */
export function diffThermalLabelSurfaces(
  reference: RgbaSurface,
  candidate: RgbaSurface
): SurfaceQcDelta {
  const ref = analyzeThermalLabelSurface(reference);
  const cand = analyzeThermalLabelSurface(candidate);

  const boundsDelta =
    ref.contentBounds && cand.contentBounds
      ? {
          minX: cand.contentBounds.minX - ref.contentBounds.minX,
          minY: cand.contentBounds.minY - ref.contentBounds.minY,
          maxX: cand.contentBounds.maxX - ref.contentBounds.maxX,
          maxY: cand.contentBounds.maxY - ref.contentBounds.maxY,
        }
      : null;

  return {
    inkPixels: cand.inkPixels,
    inkDelta: cand.inkPixels - ref.inkPixels,
    borderDeltas: {
      top: cand.border.top - ref.border.top,
      right: cand.border.right - ref.border.right,
      bottom: cand.border.bottom - ref.border.bottom,
      left: cand.border.left - ref.border.left,
    },
    boundsDelta,
  };
}
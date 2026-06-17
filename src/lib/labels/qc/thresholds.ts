import { THERMAL_MIN_INK_PIXELS } from '../thermalRasterize';
import type { ThermalLabelSpec } from '../thermalLabelSpecs';

/** Pass/fail gates for master 40×30 thermal labels. */
export interface ThermalLabelQcThresholds {
  minInkPixels: number;
  /** Each edge: fraction of pixels that must be black (0–1). */
  minBorderCoverage: number;
  /** Content bbox must stay inside spec margins ± this many px. */
  marginSlackPx: number;
  /** Among non-border ink pixels, fraction that must be “dark” (luminance < darkLumMax). */
  minCoreInkDarkRatio: number;
  darkLumMax: number;
  /** Warn if ink count drops more than this vs reference render for same fixture. */
  regressionInkDeltaWarn: number;
}

export const QC_40X30_THRESHOLDS: ThermalLabelQcThresholds = {
  minInkPixels: THERMAL_MIN_INK_PIXELS,
  minBorderCoverage: 0.85,
  marginSlackPx: 2,
  minCoreInkDarkRatio: 0.92,
  darkLumMax: 64,
  regressionInkDeltaWarn: 40,
};

export const QC_THRESHOLDS_BY_SPEC: Record<'40x30' | '40x80', ThermalLabelQcThresholds> = {
  '40x30': QC_40X30_THRESHOLDS,
  '40x80': {
    ...QC_40X30_THRESHOLDS,
    minInkPixels: 200,
    minBorderCoverage: 0.8,
  },
};

export function marginsToPx(
  spec: ThermalLabelSpec
): { top: number; right: number; bottom: number; left: number } {
  const p = spec.pxPerMm;
  return {
    top: Math.round(spec.margins.top * p),
    right: Math.round(spec.margins.right * p),
    bottom: Math.round(spec.margins.bottom * p),
    left: Math.round(spec.margins.left * p),
  };
}
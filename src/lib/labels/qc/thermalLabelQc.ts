import type { ThermalLabelSpec } from '../thermalLabelSpecs';
import { borderInsetPx } from '../thermalLabelSpecs';
import { marginsToPx, type ThermalLabelQcThresholds } from './thresholds';
import type { QcCheckResult, ThermalLabelQcMetrics, ThermalLabelQcReport } from './types';

export interface RgbaSurface {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function lumAt(data: Uint8ClampedArray, x: number, y: number, width: number): number {
  const i = (y * width + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function isInk(data: Uint8ClampedArray, x: number, y: number, width: number): boolean {
  return lumAt(data, x, y, width) < 128;
}

type BorderInsetPx = { top: number; right: number; bottom: number; left: number };

function edgeCoverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  edge: 'top' | 'right' | 'bottom' | 'left',
  inset: BorderInsetPx
): number {
  let ink = 0;
  let total = 0;

  if (edge === 'top' || edge === 'bottom') {
    const y = edge === 'top' ? inset.top : height - 1 - inset.bottom;
    for (let x = inset.left; x < width - inset.right; x++) {
      total += 1;
      if (isInk(data, x, y, width)) ink += 1;
    }
    return total ? ink / total : 0;
  }

  const x = edge === 'left' ? inset.left : width - 1 - inset.right;
  for (let y = inset.top; y < height - inset.bottom; y++) {
    total += 1;
    if (isInk(data, x, y, width)) ink += 1;
  }
  return total ? ink / total : 0;
}

/** Pixels inside the label but outside the inset border ring. */
function isCorePixel(
  x: number,
  y: number,
  width: number,
  height: number,
  inset: BorderInsetPx
): boolean {
  return (
    x > inset.left &&
    y > inset.top &&
    x < width - 1 - inset.right &&
    y < height - 1 - inset.bottom
  );
}

export function analyzeThermalLabelSurface(
  surface: RgbaSurface,
  borderInset: BorderInsetPx = { top: 5, right: 3, bottom: 3, left: 9 }
): ThermalLabelQcMetrics {
  const { width, height, data } = surface;
  let inkPixels = 0;
  let coreInkPixels = 0;
  let coreDark = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let coreMinX = width;
  let coreMinY = height;
  let coreMaxX = -1;
  let coreMaxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk(data, x, y, width)) continue;
      inkPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (isCorePixel(x, y, width, height, borderInset)) {
        coreInkPixels += 1;
        coreMinX = Math.min(coreMinX, x);
        coreMinY = Math.min(coreMinY, y);
        coreMaxX = Math.max(coreMaxX, x);
        coreMaxY = Math.max(coreMaxY, y);
        if (lumAt(data, x, y, width) < 64) coreDark += 1;
      }
    }
  }

  /** Inner content bbox — excludes 1px border ring used for margin validation. */
  const contentBounds =
    coreInkPixels > 0
      ? { minX: coreMinX, minY: coreMinY, maxX: coreMaxX, maxY: coreMaxY }
      : inkPixels > 0
        ? { minX, minY, maxX, maxY }
        : null;

  return {
    width,
    height,
    inkPixels,
    border: {
      top: edgeCoverage(data, width, height, 'top', borderInset),
      right: edgeCoverage(data, width, height, 'right', borderInset),
      bottom: edgeCoverage(data, width, height, 'bottom', borderInset),
      left: edgeCoverage(data, width, height, 'left', borderInset),
    },
    contentBounds,
    coreInkPixels,
    coreInkDarkRatio: coreInkPixels ? coreDark / coreInkPixels : 1,
  };
}

function check(
  id: string,
  pass: boolean,
  message: string,
  opts?: { severity?: QcCheckResult['severity']; value?: number; threshold?: number | string }
): QcCheckResult {
  return {
    id,
    pass,
    severity: opts?.severity ?? 'error',
    message,
    value: opts?.value,
    threshold: opts?.threshold,
  };
}

export function runThermalLabelQc(
  surface: RgbaSurface,
  spec: ThermalLabelSpec,
  thresholds: ThermalLabelQcThresholds
): ThermalLabelQcReport {
  const metrics = analyzeThermalLabelSurface(surface, borderInsetPx(spec));
  const checks: QcCheckResult[] = [];
  const pads = marginsToPx(spec);

  checks.push(
    check('ink_pixels', metrics.inkPixels >= thresholds.minInkPixels, 'Insufficient ink (blank or failed capture)', {
      value: metrics.inkPixels,
      threshold: thresholds.minInkPixels,
    })
  );

  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const cov = metrics.border[edge];
    checks.push(
      check(
        `border_${edge}`,
        cov >= thresholds.minBorderCoverage,
        `Border incomplete on ${edge} edge`,
        { value: cov, threshold: thresholds.minBorderCoverage }
      )
    );
  }

  if (metrics.contentBounds) {
    const { minX, minY, maxX, maxY } = metrics.contentBounds;
    const slack = thresholds.marginSlackPx;
    const innerLeft = pads.left - slack;
    const innerTop = pads.top - slack;
    const innerRight = metrics.width - pads.right + slack;
    const innerBottom = metrics.height - pads.bottom + slack;

    const inMargins =
      minX >= innerLeft &&
      minY >= innerTop &&
      maxX <= innerRight &&
      maxY <= innerBottom;

    checks.push(
      check('content_margins', inMargins, 'Content extends outside label margins', {
        value: minX,
        threshold: `L${innerLeft} T${innerTop} R${innerRight} B${innerBottom}`,
      })
    );
  }

  if (metrics.coreInkPixels > 0) {
    checks.push(
      check(
        'text_contrast',
        metrics.coreInkDarkRatio >= thresholds.minCoreInkDarkRatio,
        'Ink too grey — text may print faint',
        {
          value: metrics.coreInkDarkRatio,
          threshold: thresholds.minCoreInkDarkRatio,
        }
      )
    );
  }

  const pass = checks.every((c) => c.pass || c.severity === 'warn');
  return { specId: spec.id, pass, checks, metrics };
}
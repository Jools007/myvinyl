import type { ThermalLabelSpec } from '../thermalLabelSpecs';
import { getThermalLabelSpecBySize } from '../thermalLabelSpecs';
import { QC_THRESHOLDS_BY_SPEC } from './thresholds';
import { runThermalLabelQc, type RgbaSurface } from './thermalLabelQc';
import { ThermalLabelQcError, type ThermalLabelQcReport } from './types';

export function surfaceFromCanvas(canvas: HTMLCanvasElement): RgbaSurface {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read label canvas');
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}

export function validateThermalLabelCanvas(
  canvas: HTMLCanvasElement,
  widthMm: number,
  heightMm: number,
  spec?: ThermalLabelSpec
): ThermalLabelQcReport {
  const resolved = spec ?? getThermalLabelSpecBySize(widthMm, heightMm);
  const thresholds = QC_THRESHOLDS_BY_SPEC[resolved.id];
  return runThermalLabelQc(surfaceFromCanvas(canvas), resolved, thresholds);
}

/** Runtime print gate — throws ThermalLabelQcError when QC fails. */
export function assertThermalLabelPrintable(
  canvas: HTMLCanvasElement,
  widthMm: number,
  heightMm: number,
  spec?: ThermalLabelSpec
): ThermalLabelQcReport {
  const report = validateThermalLabelCanvas(canvas, widthMm, heightMm, spec);
  if (!report.pass) throw new ThermalLabelQcError(report);
  return report;
}
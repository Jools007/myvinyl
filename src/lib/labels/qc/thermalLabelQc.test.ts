import { describe, expect, it } from 'vitest';
import { borderInsetPx, SPEC_40X30 } from '../thermalLabelSpecs';
import { QC_40X30_THRESHOLDS } from './thresholds';
import { analyzeThermalLabelSurface, runThermalLabelQc, type RgbaSurface } from './thermalLabelQc';

function blankSurface(w: number, h: number): RgbaSurface {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
}

function borderedSurface(w: number, h: number): RgbaSurface {
  const inset = borderInsetPx(SPEC_40X30);
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let x = inset.left; x < w - inset.right; x++) {
    setBlack(data, x, inset.top, w);
    setBlack(data, x, h - 1 - inset.bottom, w);
  }
  for (let y = inset.top; y < h - inset.bottom; y++) {
    setBlack(data, inset.left, y, w);
    setBlack(data, w - 1 - inset.right, y, w);
  }
  // Core text blob inside margins (SPEC_40X30 left ≈ 16px, top ≈ 12px)
  for (let y = 14; y < 22; y++) {
    for (let x = 18; x < 50; x++) {
      setBlack(data, x, y, w);
    }
  }
  return { width: w, height: h, data };
}

function setBlack(data: Uint8ClampedArray, x: number, y: number, width: number): void {
  const i = (y * width + x) * 4;
  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 255;
}

describe('thermalLabelQc', () => {
  it('fails blank canvas (ink below THERMAL_MIN_INK_PIXELS)', () => {
    const surface = blankSurface(320, 240);
    const report = runThermalLabelQc(surface, SPEC_40X30, QC_40X30_THRESHOLDS);
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.id === 'ink_pixels')?.pass).toBe(false);
  });

  it('passes bordered label with inner content', () => {
    const surface = borderedSurface(320, 240);
    const metrics = analyzeThermalLabelSurface(surface);
    expect(metrics.inkPixels).toBeGreaterThan(120);
    expect(metrics.border.top).toBe(1);
    expect(metrics.border.left).toBe(1);

    const report = runThermalLabelQc(surface, SPEC_40X30, QC_40X30_THRESHOLDS);
    expect(report.pass).toBe(true);
  });

  it('fails when border is missing on one edge', () => {
    const surface = borderedSurface(320, 240);
    const inset = borderInsetPx(SPEC_40X30);
    // Erase top border at hardware inset
    for (let x = inset.left; x < surface.width - inset.right; x++) {
      const i = (inset.top * surface.width + x) * 4;
      surface.data[i] = 255;
      surface.data[i + 1] = 255;
      surface.data[i + 2] = 255;
    }
    const report = runThermalLabelQc(surface, SPEC_40X30, QC_40X30_THRESHOLDS);
    expect(report.checks.find((c) => c.id === 'border_top')?.pass).toBe(false);
  });

  it('fails when content bleeds past margins', () => {
    const surface = borderedSurface(320, 240);
    const inset = borderInsetPx(SPEC_40X30);
    setBlack(surface.data, inset.left + 1, inset.top + 1, surface.width);
    const report = runThermalLabelQc(surface, SPEC_40X30, QC_40X30_THRESHOLDS);
    expect(report.checks.find((c) => c.id === 'content_margins')?.pass).toBe(false);
  });
});
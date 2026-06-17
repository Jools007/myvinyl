/** Luminance cutoff — matches phomymo / Print Master threshold raster (128). */
export const THERMAL_INK_THRESHOLD = 128;

/** How supersampled pixels collapse to printer-native dots. */
export type DownsampleStrategy = 'mean' | 'dark' | 'any-ink';

/** Minimum black pixels expected on a 40×30 mm label (border + type). */
export const THERMAL_MIN_INK_PIXELS = 120;

export function countInkPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 128) count += 1;
  }
  return count;
}

/**
 * Area-average downsample any hi-res capture to printer-native pixels, then threshold.
 * Maps source → output proportionally (no stretch from aspect-ratio mismatch).
 */
export function boxDownsampleTo1Bit(
  source: HTMLCanvasElement,
  outW: number,
  outH: number,
  threshold = THERMAL_INK_THRESHOLD,
  strategy: DownsampleStrategy = 'dark'
): HTMLCanvasElement {
  const srcCtx = source.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('Could not read capture canvas');

  const { width: srcW, height: srcH } = source;
  const srcImg = srcCtx.getImageData(0, 0, srcW, srcH);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Could not create print canvas');

  const outImg = outCtx.createImageData(outW, outH);
  const src = srcImg.data;
  const dst = outImg.data;

  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor((y * srcH) / outH);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / outH));

    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor((x * srcW) / outW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / outW));

      let sum = 0;
      let count = 0;
      let minLum = 255;
      let hasInk = false;
      const inkDetect = Math.min(210, threshold + 28);
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const idx = (sy * srcW + sx) * 4;
          const lum =
            0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
          if (lum < inkDetect) hasInk = true;
          if (strategy === 'dark' || strategy === 'any-ink') {
            minLum = Math.min(minLum, lum);
          } else {
            sum += lum;
            count += 1;
          }
        }
      }

      const lum = strategy === 'mean' ? (count ? sum / count : 255) : minLum;
      const bit =
        strategy === 'any-ink'
          ? hasInk
            ? 0
            : 255
          : lum < threshold
            ? 0
            : 255;
      const o = (y * outW + x) * 4;
      dst[o] = bit;
      dst[o + 1] = bit;
      dst[o + 2] = bit;
      dst[o + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return out;
}

/** In-place threshold at printer-native resolution (phomymo _pixelsToRasterThreshold path). */
export function thresholdCanvasInPlace(
  canvas: HTMLCanvasElement,
  threshold = THERMAL_INK_THRESHOLD
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not threshold label canvas');

  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bit = lum < threshold ? 0 : 255;
    data[i] = bit;
    data[i + 1] = bit;
    data[i + 2] = bit;
    data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}
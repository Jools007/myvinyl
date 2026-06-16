/** Luminance cutoff when converting greyscale capture → 1-bit thermal ink. */
export const THERMAL_INK_THRESHOLD = 185;

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
  threshold = THERMAL_INK_THRESHOLD
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
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const idx = (sy * srcW + sx) * 4;
          sum += 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
          count += 1;
        }
      }

      const lum = count ? sum / count : 255;
      const bit = lum < threshold ? 0 : 255;
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
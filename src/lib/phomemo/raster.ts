export type RasterAlignment = 'left' | 'center' | 'right';

export interface RasterData {
  data: Uint8Array;
  widthBytes: number;
  heightLines: number;
}

/** Convert RGBA canvas pixels to 1-bit packed raster for Phomemo m-series. */
export function pixelsToRaster(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  outputWidthBytes: number,
  alignment: RasterAlignment = 'left'
): Uint8Array {
  const canvasBytesPerRow = Math.ceil(width / 8);
  const output = new Uint8Array(outputWidthBytes * height);

  let offset = 0;
  if (alignment === 'center') {
    offset = Math.floor((outputWidthBytes - canvasBytesPerRow) / 2);
  } else if (alignment === 'right') {
    offset = outputWidthBytes - canvasBytesPerRow;
  }

  for (let y = 0; y < height; y++) {
    for (let byteX = 0; byteX < canvasBytesPerRow; byteX++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const brightness =
          0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        if (brightness < 128) {
          byte |= 1 << (7 - bit);
        }
      }
      const outputPos = y * outputWidthBytes + offset + byteX;
      if (outputPos >= 0 && outputPos < output.length) {
        output[outputPos] = byte;
      }
    }
  }

  return output;
}

function readCanvasPixels(canvas: HTMLCanvasElement): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read label canvas');
  const { width, height } = canvas;
  return {
    pixels: ctx.getImageData(0, 0, width, height).data,
    width,
    height,
  };
}

/**
 * Label-native raster: header width matches the label (e.g. 40mm → 40 bytes).
 * Use this for die-cut rolls smaller than the print head.
 */
export function canvasToLabelRaster(canvas: HTMLCanvasElement): RasterData {
  const { pixels, width, height } = readCanvasPixels(canvas);
  const widthBytes = Math.ceil(width / 8);
  const data = pixelsToRaster(pixels, width, height, widthBytes, 'left');
  return { data, widthBytes, heightLines: height };
}

/** Pad label image to full print-head width (72 bytes on M220). */
export function canvasToHeadRaster(
  canvas: HTMLCanvasElement,
  headWidthBytes: number,
  alignment: RasterAlignment = 'left'
): RasterData {
  const { pixels, width, height } = readCanvasPixels(canvas);
  const data = pixelsToRaster(pixels, width, height, headWidthBytes, alignment);
  return { data, widthBytes: headWidthBytes, heightLines: height };
}

/** M220 raster: pad label canvas to 72-byte head width with roll alignment. */
export function canvasToM220Raster(
  canvas: HTMLCanvasElement,
  headWidthBytes: number,
  alignment: RasterAlignment
): RasterData {
  return canvasToHeadRaster(canvas, headWidthBytes, alignment);
}

/**
 * Die-cut rolls (e.g. 40×30 mm): header width must match the label, not the 72 mm head.
 * Padding to 72 bytes makes the firmware scale content down (~40/72) → tiny illegible type.
 */
export function rasterForDieCutLabel(canvas: HTMLCanvasElement): RasterData {
  return canvasToLabelRaster(canvas);
}

/** @deprecated Prefer canvasToLabelRaster for die-cut labels. */
export function canvasToRaster(
  canvas: HTMLCanvasElement,
  outputWidthBytes: number,
  alignment: RasterAlignment = 'left'
): RasterData {
  return canvasToHeadRaster(canvas, outputWidthBytes, alignment);
}
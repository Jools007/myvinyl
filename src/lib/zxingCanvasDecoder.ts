import * as ZXing from 'html5-qrcode/third_party/zxing-js.umd.js';
import {
  SCANNER_MAX_DECODE_DIMENSION,
  SCANNER_PORTRAIT_ASPECT_THRESHOLD,
} from './scannerConfig';

const VINYL_ZXING_FORMATS = [
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.EAN_8,
];

let reader: InstanceType<typeof ZXing.MultiFormatReader> | null = null;

/** Drop cached reader after a stalled decode loop (ZXing can wedge on iOS). */
export function resetBarcodeDecoder(): void {
  reader = null;
}

function getReader(): InstanceType<typeof ZXing.MultiFormatReader> {
  if (!reader) {
    const hints = new Map<number, unknown>();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, VINYL_ZXING_FORMATS);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    reader = new ZXing.MultiFormatReader(false, hints);
  }
  return reader;
}

function tryDecode(bitmap: InstanceType<typeof ZXing.BinaryBitmap>): string | null {
  try {
    const result = getReader().decode(bitmap);
    return typeof result?.text === 'string' ? result.text : null;
  } catch {
    return null;
  }
}

function getGlobalHistogramBinarizer():
  | (new (
      luminanceSource: InstanceType<typeof ZXing.HTMLCanvasElementLuminanceSource>
    ) => InstanceType<typeof ZXing.HybridBinarizer>)
  | null {
  return (
    ZXing as typeof ZXing & {
      GlobalHistogramBinarizer: new (
        luminanceSource: InstanceType<typeof ZXing.HTMLCanvasElementLuminanceSource>
      ) => InstanceType<typeof ZXing.HybridBinarizer>;
    }
  ).GlobalHistogramBinarizer ?? null;
}

function decodeFromCanvasSource(
  source: InstanceType<typeof ZXing.HTMLCanvasElementLuminanceSource>
): string | null {
  const hybrid = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
  const fromHybrid = tryDecode(hybrid);
  if (fromHybrid) return fromHybrid;

  const GlobalHistogramBinarizer = getGlobalHistogramBinarizer();
  if (!GlobalHistogramBinarizer) return null;

  const global = new ZXing.BinaryBitmap(new GlobalHistogramBinarizer(source));
  return tryDecode(global);
}

function scaleDimensions(width: number, height: number): { width: number; height: number } {
  const maxDim = Math.max(width, height);
  if (maxDim <= SCANNER_MAX_DECODE_DIMENSION) {
    return { width, height };
  }
  const scale = SCANNER_MAX_DECODE_DIMENSION / maxDim;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function rotationsForFrame(width: number, height: number): number[] {
  if (height > width * SCANNER_PORTRAIT_ASPECT_THRESHOLD) {
    return [0, 90, 270];
  }
  return [0, 180];
}

function drawSourceToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  rotationDeg: number
): HTMLCanvasElement | null {
  const target = scaleDimensions(width, height);
  const scratch = document.createElement('canvas');
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;

  if (rotationDeg === 0) {
    scratch.width = target.width;
    scratch.height = target.height;
    ctx.drawImage(source, 0, 0, target.width, target.height);
    return scratch;
  }

  const rad = (rotationDeg * Math.PI) / 180;
  if (rotationDeg === 90 || rotationDeg === 270) {
    scratch.width = target.height;
    scratch.height = target.width;
  } else {
    scratch.width = target.width;
    scratch.height = target.height;
  }

  ctx.translate(scratch.width / 2, scratch.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -target.width / 2, -target.height / 2, target.width, target.height);
  return scratch;
}

export function decodeBarcodeFromCanvas(canvas: HTMLCanvasElement): string | null {
  const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
  return decodeFromCanvasSource(source);
}

export function decodeBarcodeFromImageSource(
  source: CanvasImageSource,
  width: number,
  height: number
): string | null {
  for (const rotation of rotationsForFrame(width, height)) {
    const canvas = drawSourceToCanvas(source, width, height, rotation);
    if (!canvas) continue;
    const hit = decodeBarcodeFromCanvas(canvas);
    if (hit) return hit;
  }
  return null;
}
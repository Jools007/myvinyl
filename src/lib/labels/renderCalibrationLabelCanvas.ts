import { boxDownsampleTo1Bit } from './thermalRasterize';
import {
  borderInsetPx,
  getThermalLabelSpecBySize,
  THERMAL_BORDER_INSET_MM,
  THERMAL_FONT_FAMILY,
  THERMAL_PRINT_PIPELINE,
  THERMAL_PRINT_SUPERSAMPLE,
  type ThermalLabelSpec,
} from './thermalLabelSpecs';
import { ensureThermalLabelFonts } from './renderThermalLabelCanvas';

const BLACK = '#000000';
const WHITE = '#FFFFFF';

function px(spec: ThermalLabelSpec, mm: number): number {
  return Math.round(mm * spec.pxPerMm);
}

function font(spec: ThermalLabelSpec, sizeMm: number, weight: number): string {
  return `${weight} ${px(spec, sizeMm)}px ${THERMAL_FONT_FAMILY}`;
}

function drawBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inset: ReturnType<typeof borderInsetPx>
): void {
  const { top, right, bottom, left } = inset;
  const innerW = w - left - right;
  const innerH = h - top - bottom;
  if (innerW < 2 || innerH < 2) return;

  const x0 = left;
  const x1 = w - right - 1;
  const y0 = top;
  const y1 = h - bottom - 1;

  ctx.fillStyle = BLACK;
  ctx.fillRect(x0, y0, innerW, 1);
  ctx.fillRect(x0, y1, innerW, 1);
  ctx.fillRect(x0, y0, 1, innerH);
  ctx.fillRect(x1, y0, 1, innerH);
}

/** Left-edge mm ruler ticks (0–4 mm) to locate physical clip zone. */
function drawLeftRuler(ctx: CanvasRenderingContext2D, spec: ThermalLabelSpec): void {
  const p = spec.pxPerMm;
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1;

  for (let mm = 0; mm <= 4; mm++) {
    const x = Math.round(mm * p);
    const tickH = mm % 1 === 0 ? 6 : 3;
    ctx.fillRect(x, 0, 1, tickH);
    if (mm > 0) {
      ctx.font = font(spec, 0.75, 700);
      ctx.fillText(`${mm}`, x + 1, tickH + px(spec, 0.85));
    }
  }
}

const LEGIBILITY_SAMPLES: Array<{ sizeMm: number; label: string }> = [
  { sizeMm: 1.5, label: '1.5mm — The quick brown fox' },
  { sizeMm: 1.75, label: '1.75mm — Washington DC jazz' },
  { sizeMm: 1.9, label: '1.9mm — Mister Magic groove' },
  { sizeMm: 2.1, label: '2.1mm — Legibility sample' },
  { sizeMm: 2.3, label: '2.3mm — Crate label notes' },
];

function renderCalibration(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec
): void {
  const w = px(spec, spec.widthMm);
  const h = px(spec, spec.heightMm);
  const inset = borderInsetPx(spec);

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, w, h);

  drawLeftRuler(ctx, spec);
  drawBorder(ctx, w, h, inset);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = BLACK;

  const header = `CAL L${THERMAL_BORDER_INSET_MM.left} T${THERMAL_BORDER_INSET_MM.top}`;
  ctx.font = font(spec, 1.0, 800);
  ctx.fillText(header, px(spec, 2.0), px(spec, 1.45));

  let y = px(spec, 3.2);
  const x = px(spec, 2.0);
  const maxW = w - x - px(spec, 0.9);

  for (const sample of LEGIBILITY_SAMPLES) {
    ctx.font = font(spec, sample.sizeMm, 800);
    const text =
      ctx.measureText(sample.label).width > maxW
        ? `${sample.label.slice(0, 28)}…`
        : sample.label;
    ctx.fillText(text, x, y);
    y += px(spec, sample.sizeMm * 1.15);
    if (y > h - px(spec, 3.2)) break;
  }

  ctx.font = font(spec, 0.85, 700);
  ctx.fillText('Border ticks = mm from left edge', x, h - px(spec, 2.4));
}

/** Diagnostic 40×30 label — ruler, border inset, font-size samples. */
export async function renderCalibrationLabelCanvas(
  widthMm: number,
  heightMm: number
): Promise<HTMLCanvasElement> {
  await ensureThermalLabelFonts();

  const spec = getThermalLabelSpecBySize(widthMm, heightMm);
  const outW = px(spec, spec.widthMm);
  const outH = px(spec, spec.heightMm);
  const factor = THERMAL_PRINT_SUPERSAMPLE;

  const hiCanvas = document.createElement('canvas');
  hiCanvas.width = outW * factor;
  hiCanvas.height = outH * factor;

  const hiCtx = hiCanvas.getContext('2d');
  if (!hiCtx) throw new Error('Could not create calibration canvas');

  hiCtx.scale(factor, factor);
  hiCtx.imageSmoothingEnabled = true;
  hiCtx.imageSmoothingQuality = 'high';
  renderCalibration(hiCtx, spec);

  return boxDownsampleTo1Bit(
    hiCanvas,
    outW,
    outH,
    THERMAL_PRINT_PIPELINE.inkThreshold,
    THERMAL_PRINT_PIPELINE.downsample
  );
}
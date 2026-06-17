import { buildCrateLabelContent } from '../labelContent';
import type { LabelDisplayPrefs, VinylRecord } from '../types';
import { fitNotesTextForLines, fitThermalLabelNotes } from './fitThermalLabelNotes';
import { boxDownsampleTo1Bit } from './thermalRasterize';
import {
  borderInsetPx,
  getThermalLabelSpecBySize,
  identityLinePlan,
  THERMAL_FONT_FAMILY,
  THERMAL_PRINT_PIPELINE,
  THERMAL_PRINT_SUPERSAMPLE,
  type ThermalLabelSpec,
} from './thermalLabelSpecs';

const BLACK = '#000000';
const WHITE = '#FFFFFF';

/** Wait for Atkinson Hyperlegible so canvas print matches thermal preview. */
export async function ensureThermalLabelFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  const sizes = [9, 11, 12, 14, 15, 16, 17, 18, 22, 26, 30, 33, 36];
  await Promise.all(
    sizes.flatMap((px) => [
      document.fonts.load(`800 ${px}px ${THERMAL_FONT_FAMILY}`),
      document.fonts.load(`700 ${px}px ${THERMAL_FONT_FAMILY}`),
      document.fonts.load(`600 ${px}px ${THERMAL_FONT_FAMILY}`),
      document.fonts.load(`400 ${px}px ${THERMAL_FONT_FAMILY}`),
    ])
  );
  await document.fonts.ready;
}

/** Snap to half-pixel grid so glyph dots survive 1-bit downsample. */
function drawThermalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number
): void {
  ctx.fillStyle = BLACK;
  ctx.fillText(text, Math.round(x * 2) / 2, Math.round(y * 2) / 2);
}

export interface ThermalLabelRenderOptions {
  description?: string;
  useDescriptionDraft?: boolean;
  baseDescription?: string;
  vibes?: string[];
  useVibesDraft?: boolean;
  display?: LabelDisplayPrefs;
  useDisplayDraft?: boolean;
}

function px(spec: ThermalLabelSpec, mm: number): number {
  return Math.round(mm * spec.pxPerMm);
}

function font(spec: ThermalLabelSpec, sizeMm: number, weight: number): string {
  return `${weight} ${px(spec, sizeMm)}px ${THERMAL_FONT_FAMILY}`;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text || ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = words[0] ?? '';

  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i] ?? '';
      if (lines.length >= maxLines - 1) break;
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines).map((line) => truncate(ctx, line, maxWidth));
}

function drawIdentityStack(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  data: ReturnType<typeof buildCrateLabelContent>,
  x: number,
  y: number,
  innerW: number
): number {
  const plan = identityLinePlan(data.titleLayout);
  const texts =
    data.titleLayout === 'album-only'
      ? [data.album]
      : data.titleLayout === 'album-artist'
        ? [data.album, data.artist]
        : [data.artist, data.album];

  let cursorY = y;
  for (let i = 0; i < plan.length; i++) {
    const line = plan[i];
    const isDisplay = line.role === 'display';
    const sizeMm = isDisplay ? spec.type.display : spec.type.title;
    const weight = isDisplay ? 800 : 600;
    const lineMm = isDisplay ? spec.type.display * 0.98 : spec.type.title * 1.05;
    const text = texts[i] ?? '';
    if (!text) continue;

    ctx.font = font(spec, sizeMm, weight);
    const lines =
      line.maxLines > 1
        ? wrapLines(ctx, text, innerW, line.maxLines)
        : [truncate(ctx, text, innerW)];
    for (const row of lines) {
      drawThermalText(ctx, row, x, cursorY);
      cursorY += px(spec, lineMm);
    }
    if (i < plan.length - 1) cursorY += px(spec, 0.15);
  }

  return cursorY;
}

function buildMixInlineText(data: ReturnType<typeof buildCrateLabelContent>): string {
  const parts: string[] = [];
  if (data.showBpm) {
    const bpm = data.bpm != null ? `${data.bpmEstimated ? '~' : ''}${data.bpm}` : '—';
    parts.push(`${bpm} BPM`);
  }
  if (data.showKey) {
    const key = data.camelot ?? '—';
    const est = data.keyEstimated && data.camelot ? '~' : '';
    parts.push(`${key} KEY${est}`);
  }
  return parts.join(' · ');
}

/** Per-edge inset border — extra left/top padding for M220 printable area. */
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

type Canvas2D = CanvasRenderingContext2D & { letterSpacing?: string };

/** Draw notes centered in the zone below vibes — extra tracking preserves lowercase i dots. */
function drawNotesBlock(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  text: string,
  x: number,
  zoneTop: number,
  zoneBottom: number,
  innerW: number,
  maxLinesCap: number
): void {
  const sizeMm = spec.type.notes;
  const weight = 700;
  const c2d = ctx as Canvas2D;
  ctx.font = font(spec, sizeMm, weight);
  c2d.letterSpacing = `${Math.max(1, px(spec, 0.06))}px`;

  const lineH = px(spec, sizeMm * 1.12);
  const available = zoneBottom - zoneTop;
  const maxLines = Math.max(
    1,
    Math.min(maxLinesCap, Math.floor(available / Math.max(lineH, 1)))
  );
  const fitted = fitNotesTextForLines(ctx, text, innerW, maxLines);
  const lines = wrapLines(ctx, fitted, innerW, maxLines);
  const blockH = lines.length * lineH;
  let y = zoneTop + Math.max(0, Math.floor((available - blockH) / 2));

  for (const line of lines) {
    if (y + lineH > zoneBottom) break;
    drawThermalText(ctx, line, x, y);
    y += lineH;
  }

  c2d.letterSpacing = '0px';
}

function drawRail(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  data: ReturnType<typeof buildCrateLabelContent>,
  x: number,
  y: number,
  innerW: number
): void {
  ctx.fillStyle = BLACK;
  ctx.fillRect(x, y, innerW, 1);

  const textY = y + px(spec, 0.16);
  ctx.font = font(spec, spec.type.brand, 800);
  drawThermalText(ctx, 'MyVinyl', x, textY);

  const meta = [data.format, data.year].filter(Boolean).join(' · ').toUpperCase();
  if (meta) {
    ctx.textAlign = 'right';
    ctx.font = font(spec, spec.type.rail, 700);
    drawThermalText(ctx, truncate(ctx, meta, innerW * 0.65), x + innerW, textY);
    ctx.textAlign = 'left';
  }
}

function renderLabel(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  data: ReturnType<typeof buildCrateLabelContent>
): void {
  const w = px(spec, spec.widthMm);
  const h = px(spec, spec.heightMm);
  const padL = px(spec, spec.margins.left);
  const padR = px(spec, spec.margins.right);
  const padT = px(spec, spec.margins.top);
  const padB = px(spec, spec.margins.bottom);
  const innerW = w - padL - padR;
  const gap = px(spec, spec.stackGap);
  const footerZone = px(spec, spec.footerZone);
  const footerY = h - padB - footerZone;

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, w, h);

  drawBorder(ctx, w, h, borderInsetPx(spec));

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  let y = padT;
  y = drawIdentityStack(ctx, spec, data, padL, y, innerW);

  const showMix = data.showBpm || data.showKey;
  if (showMix) {
    y += gap;
    const mixText = buildMixInlineText(data);
    ctx.font = font(spec, spec.type.statInline, 800);
    drawThermalText(ctx, truncate(ctx, mixText, innerW), padL, y);
    y += px(spec, spec.type.statInline * 1.08);
  }

  if (data.showVibes && data.vibes.length) {
    y += px(spec, showMix ? (spec.mixVibesGap ?? spec.stackGap) : spec.stackGap);
    const vibeText = data.vibes.slice(0, spec.zones.vibesMax).join(' · ').toUpperCase();
    ctx.font = font(spec, spec.type.vibes, 800);
    drawThermalText(ctx, truncate(ctx, vibeText, innerW), padL, y);
    y += px(spec, spec.type.vibes * 1.1);
    y += px(spec, spec.vibesNotesGap ?? spec.stackGap);
  }

  if (data.customNotes.trim()) {
    const fittedNotes = fitThermalLabelNotes(ctx, spec, data);
    drawNotesBlock(
      ctx,
      spec,
      fittedNotes,
      padL,
      y,
      footerY,
      innerW,
      spec.zones.notesMaxLines + 1
    );
  }

  drawRail(ctx, spec, data, padL, footerY, innerW);
}

/** Render a 1-bit-friendly thermal label canvas (pure black on white). */
export async function renderThermalLabelCanvas(
  record: VinylRecord,
  widthMm: number,
  heightMm: number,
  options?: ThermalLabelRenderOptions
): Promise<HTMLCanvasElement> {
  await ensureThermalLabelFonts();

  const spec = getThermalLabelSpecBySize(widthMm, heightMm);
  const useDraft =
    options?.useDescriptionDraft ||
    options?.useVibesDraft ||
    options?.useDisplayDraft;

  const data = buildCrateLabelContent(
    record,
    useDraft
      ? {
          description: options?.description,
          useDescriptionDraft: options?.useDescriptionDraft,
          baseDescription: options?.baseDescription,
          vibes: options?.vibes,
          useVibesDraft: options?.useVibesDraft,
          display: options?.display,
          useDisplayDraft: options?.useDisplayDraft,
        }
      : options
        ? { baseDescription: options.baseDescription }
        : undefined
  );

  const outW = px(spec, spec.widthMm);
  const outH = px(spec, spec.heightMm);
  const factor = THERMAL_PRINT_SUPERSAMPLE;

  const hiCanvas = document.createElement('canvas');
  hiCanvas.width = outW * factor;
  hiCanvas.height = outH * factor;

  const hiCtx = hiCanvas.getContext('2d');
  if (!hiCtx) throw new Error('Could not create label canvas');

  hiCtx.scale(factor, factor);
  hiCtx.imageSmoothingEnabled = true;
  hiCtx.imageSmoothingQuality = 'high';
  renderLabel(hiCtx, spec, data);

  return boxDownsampleTo1Bit(
    hiCanvas,
    outW,
    outH,
    THERMAL_PRINT_PIPELINE.inkThreshold,
    THERMAL_PRINT_PIPELINE.downsample
  );
}

export async function thermalLabelPreviewDataUrl(
  record: VinylRecord,
  widthMm: number,
  heightMm: number,
  options?: ThermalLabelRenderOptions
): Promise<string> {
  const canvas = await renderThermalLabelCanvas(record, widthMm, heightMm, options);
  return canvas.toDataURL('image/png');
}
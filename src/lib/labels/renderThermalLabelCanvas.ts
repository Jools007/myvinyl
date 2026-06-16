import { buildCrateLabelContent } from '../labelContent';
import type { LabelDisplayPrefs, VinylRecord } from '../types';
import { boxDownsampleTo1Bit } from './thermalRasterize';
import {
  getThermalLabelSpecBySize,
  identityLinePlan,
  THERMAL_FONT_FAMILY,
  THERMAL_PRINT_SUPERSAMPLE,
  type ThermalLabelSpec,
} from './thermalLabelSpecs';

const BLACK = '#000000';
const WHITE = '#FFFFFF';

/** Wait for DM Sans so canvas print matches the DOM label. */
export async function ensureThermalLabelFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  const sizes = [9, 11, 12, 14, 18, 22, 26, 30, 33, 36];
  await Promise.all(
    sizes.flatMap((px) => [
      document.fonts.load(`800 ${px}px ${THERMAL_FONT_FAMILY}`),
      document.fonts.load(`700 ${px}px ${THERMAL_FONT_FAMILY}`),
      document.fonts.load(`600 ${px}px ${THERMAL_FONT_FAMILY}`),
      document.fonts.load(`500 ${px}px ${THERMAL_FONT_FAMILY}`),
    ])
  );
  await document.fonts.ready;
}

export interface ThermalLabelRenderOptions {
  description?: string;
  useDescriptionDraft?: boolean;
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
    ctx.fillStyle = BLACK;
    if (line.maxLines > 1) {
      for (const row of wrapLines(ctx, text, innerW, line.maxLines)) {
        ctx.fillText(row, x, cursorY);
        cursorY += px(spec, lineMm);
      }
    } else {
      ctx.fillText(truncate(ctx, text, innerW), x, cursorY);
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

  const textY = y + px(spec, 0.22);
  ctx.font = font(spec, spec.type.brand, 800);
  ctx.fillStyle = BLACK;
  ctx.fillText('MyVinyl', x, textY);

  const meta = [data.format, data.year].filter(Boolean).join(' · ').toUpperCase();
  if (meta) {
    ctx.textAlign = 'right';
    ctx.font = font(spec, spec.type.rail, 600);
    ctx.fillText(truncate(ctx, meta, innerW * 0.65), x + innerW, textY);
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

  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  let y = padT;
  y = drawIdentityStack(ctx, spec, data, padL, y, innerW);

  const showMix = data.showBpm || data.showKey;
  if (showMix) {
    y += gap;
    const mixText = buildMixInlineText(data);
    ctx.font = font(spec, spec.type.statInline, 700);
    ctx.fillStyle = BLACK;
    ctx.fillText(truncate(ctx, mixText, innerW), padL, y);
    y += px(spec, spec.type.statInline * 1.08);
  }

  if (data.showVibes && data.vibes.length) {
    y += gap;
    const vibeText = data.vibes.slice(0, spec.zones.vibesMax).join(' · ').toUpperCase();
    ctx.font = font(spec, spec.type.vibes, 700);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(truncate(ctx, vibeText, innerW), padL, y);
    y += px(spec, spec.type.vibes * 1.1);
  }

  if (data.customNotes.trim()) {
    y += gap;
    ctx.font = font(spec, spec.type.notes, 500);
    const lineH = px(spec, spec.type.notes * 1.1);
    const available = footerY - gap - y;
    const maxLines = Math.max(
      1,
      Math.min(
        spec.zones.notesMaxLines + 1,
        Math.floor(available / Math.max(lineH, 1))
      )
    );
    const lines = wrapLines(ctx, data.customNotes.trim(), innerW, maxLines);
    for (const line of lines) {
      if (y + lineH > footerY - px(spec, 0.1)) break;
      ctx.fillStyle = BLACK;
      ctx.fillText(line, padL, y);
      y += lineH;
    }
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
          vibes: options?.vibes,
          useVibesDraft: options?.useVibesDraft,
          display: options?.display,
          useDisplayDraft: options?.useDisplayDraft,
        }
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

  return boxDownsampleTo1Bit(hiCanvas, outW, outH);
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
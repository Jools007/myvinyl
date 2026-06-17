import type { CrateLabelContent } from '../labelContent';
import {
  identityLinePlan,
  THERMAL_FONT_FAMILY,
  type ThermalLabelSpec,
} from './thermalLabelSpecs';

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

function wrapLinesIncludeAllWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  const renderedWords = lines
    .join(' ')
    .replace(/…/g, '')
    .split(/\s+/)
    .filter(Boolean);
  return lines.length <= maxLines && renderedWords.length >= words.length;
}

export function splitNoteSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function fitWordsWithinBudget(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  let low = 1;
  let high = words.length;
  let best = '';
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const trial = words.slice(0, mid).join(' ');
    if (wrapLinesIncludeAllWords(ctx, trial, maxWidth, maxLines)) {
      best = trial;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best) {
    return /[.!?]$/.test(best) ? best : `${best}…`;
  }

  return truncate(ctx, words[0] ?? '', maxWidth);
}

/** Fit notes into the printable line budget, ending on a full sentence when possible. */
export function fitNotesTextForLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (wrapLinesIncludeAllWords(ctx, trimmed, maxWidth, maxLines)) {
    return trimmed;
  }

  const sentences = splitNoteSentences(trimmed);
  if (sentences.length > 1) {
    let built = '';
    for (const sentence of sentences) {
      const trial = built ? `${built} ${sentence}` : sentence;
      if (wrapLinesIncludeAllWords(ctx, trial, maxWidth, maxLines)) {
        built = trial;
      } else {
        break;
      }
    }
    if (built.length >= 20) return built;
    return fitWordsWithinBudget(ctx, sentences[0] ?? trimmed, maxWidth, maxLines);
  }

  return fitWordsWithinBudget(ctx, trimmed, maxWidth, maxLines);
}

function measureIdentityBottom(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  data: CrateLabelContent,
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
      cursorY += px(spec, lineMm);
      void row;
    }
    if (i < plan.length - 1) cursorY += px(spec, 0.15);
  }

  return cursorY;
}

export interface ThermalNotesZone {
  zoneTop: number;
  zoneBottom: number;
  innerW: number;
  maxLines: number;
}

/** Compute the notes rectangle used by thermal label render (px at spec scale). */
export function computeThermalNotesZone(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  data: CrateLabelContent
): ThermalNotesZone | null {
  const notes = data.customNotes.trim();
  if (!notes) return null;

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

  let y = padT;
  y = measureIdentityBottom(ctx, spec, data, y, innerW);

  const showMix = data.showBpm || data.showKey;
  if (showMix) {
    y += gap;
    y += px(spec, spec.type.statInline * 1.08);
  }

  if (data.showVibes && data.vibes.length) {
    y += px(spec, showMix ? (spec.mixVibesGap ?? spec.stackGap) : spec.stackGap);
    y += px(spec, spec.type.vibes * 1.1);
    y += px(spec, spec.vibesNotesGap ?? spec.stackGap);
  }

  const sizeMm = spec.type.notes;
  const lineH = px(spec, sizeMm * 1.12);
  const available = footerY - y;
  const maxLinesCap = spec.zones.notesMaxLines + 1;
  const maxLines = Math.max(
    1,
    Math.min(maxLinesCap, Math.floor(available / Math.max(lineH, 1)))
  );

  return { zoneTop: y, zoneBottom: footerY, innerW, maxLines };
}

/** Fit sticker notes for a thermal label layout (preview + print). */
export function fitThermalLabelNotes(
  ctx: CanvasRenderingContext2D,
  spec: ThermalLabelSpec,
  data: CrateLabelContent
): string {
  const zone = computeThermalNotesZone(ctx, spec, data);
  if (!zone) return '';

  const c2d = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  ctx.font = font(spec, spec.type.notes, 700);
  c2d.letterSpacing = `${Math.max(1, px(spec, 0.06))}px`;
  const fitted = fitNotesTextForLines(
    ctx,
    data.customNotes,
    zone.innerW,
    zone.maxLines
  );
  c2d.letterSpacing = '0px';
  return fitted;
}
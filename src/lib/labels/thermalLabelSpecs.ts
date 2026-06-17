import type { LabelPrintProfileId } from '../labelProfiles';
import type { LabelTitleLayout } from '../types';

/** Design tokens per physical label size (203 DPI Phomemo M-series). */
export type ThermalLabelSpecId = '40x30' | '40x80';

export interface ThermalLabelTypography {
  display: number;
  title: number;
  /** Single-line "80 BPM · 9B KEY" row */
  statInline: number;
  vibes: number;
  notes: number;
  rail: number;
  brand: number;
}

export interface ThermalLabelSpec {
  id: ThermalLabelSpecId;
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
  margins: { top: number; right: number; bottom: number; left: number };
  stackGap: number;
  /** Gap after BPM/mix row before vibes (mm). */
  mixVibesGap?: number;
  /** Gap after vibes before custom notes (mm). */
  vibesNotesGap?: number;
  footerZone: number;
  type: ThermalLabelTypography;
  layoutVariant: 'compact' | 'tall';
  zones: {
    vibesMax: number;
    notesMaxLines: number;
  };
}

const PX_PER_MM = 8;

/** Hi-res capture/render factor before 1-bit downsample (16 keeps i-dots separate from stems). */
export const THERMAL_PRINT_SUPERSAMPLE = 16;

/** Per-edge border inset from canvas edge (mm) — M220 clips left/top harder than right/bottom. */
export interface ThermalBorderInsetMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** M220 40×30 master — asymmetric border inset (mm). */
export const THERMAL_BORDER_INSET_MM: ThermalBorderInsetMm = {
  top: 0.65,
  right: 0.35,
  bottom: 0.35,
  left: 1.1,
};

export function borderInsetPx(
  spec: ThermalLabelSpec
): { top: number; right: number; bottom: number; left: number } {
  const p = spec.pxPerMm;
  return {
    top: Math.round(THERMAL_BORDER_INSET_MM.top * p),
    right: Math.round(THERMAL_BORDER_INSET_MM.right * p),
    bottom: Math.round(THERMAL_BORDER_INSET_MM.bottom * p),
    left: Math.round(THERMAL_BORDER_INSET_MM.left * p),
  };
}

/** Master print pipeline — 8 px/mm canvas, 16× supersample, 40-byte die-cut raster. */
export const THERMAL_PRINT_PIPELINE = {
  renderer: 'canvas' as const,
  rasterMode: 'label-native' as const,
  supersample: THERMAL_PRINT_SUPERSAMPLE,
  inkThreshold: 168,
  downsample: 'any-ink' as const,
  headWidthBytes: 40,
  headAlignment: 'left' as const,
  borderInsetMm: THERMAL_BORDER_INSET_MM,
  density: 5,
};

/** Legibility-first face — DM Sans i/I collapse to "1" on M220 1-bit output. */
const THERMAL_FONT_STACK = '"Atkinson Hyperlegible", Verdana, Tahoma, sans-serif';

export const THERMAL_FONT_FAMILY = THERMAL_FONT_STACK;

export const SPEC_40X30: ThermalLabelSpec = {
  id: '40x30',
  widthMm: 40,
  heightMm: 30,
  pxPerMm: PX_PER_MM,
  margins: { top: 1.5, right: 0.9, bottom: 0.35, left: 2.0 },
  /** Gap after identity block before BPM row (mm). */
  stackGap: 0.2,
  /** Gap after BPM row before vibes (mm). */
  mixVibesGap: 0.75,
  /** Gap after vibes before custom notes (mm). */
  vibesNotesGap: 0.8,
  /** Reserved height for pinned footer rule + meta (mm). */
  footerZone: 1.65,
  type: {
    display: 3.35,
    title: 2.65,
    statInline: 2.3,
    vibes: 1.35,
    notes: 2.0,
    rail: 0.9,
    brand: 0.95,
  },
  layoutVariant: 'compact',
  zones: {
    vibesMax: 3,
    notesMaxLines: 6,
  },
};

export const SPEC_40X80: ThermalLabelSpec = {
  id: '40x80',
  widthMm: 40,
  heightMm: 80,
  pxPerMm: PX_PER_MM,
  margins: { top: 2.0, right: 1.5, bottom: 1.5, left: 1.5 },
  stackGap: 0.35,
  footerZone: 2.5,
  type: {
    display: 3.5,
    title: 2.8,
    statInline: 2.15,
    vibes: 1.35,
    notes: 1.55,
    rail: 0.9,
    brand: 0.95,
  },
  layoutVariant: 'tall',
  zones: {
    vibesMax: 3,
    notesMaxLines: 4,
  },
};

export const THERMAL_LABEL_SPECS: Record<ThermalLabelSpecId, ThermalLabelSpec> = {
  '40x30': SPEC_40X30,
  '40x80': SPEC_40X80,
};

const PROFILE_SPEC: Partial<Record<LabelPrintProfileId, ThermalLabelSpecId>> = {
  'phomemo-40x30': '40x30',
  'phomemo-40x80': '40x80',
};

export function getThermalLabelSpec(profileId: LabelPrintProfileId): ThermalLabelSpec {
  const specId = PROFILE_SPEC[profileId] ?? '40x30';
  return THERMAL_LABEL_SPECS[specId];
}

export function getThermalLabelSpecBySize(widthMm: number, heightMm: number): ThermalLabelSpec {
  if (widthMm === 40 && heightMm >= 70) return SPEC_40X80;
  return SPEC_40X30;
}

export function specPreviewZoom(spec: ThermalLabelSpec): number {
  return spec.heightMm <= 35 ? 2.35 : 2;
}

export function identityLinePlan(
  layout: LabelTitleLayout
): Array<{ role: 'display' | 'title'; maxLines: number }> {
  if (layout === 'album-only') {
    return [{ role: 'display', maxLines: 2 }];
  }
  if (layout === 'album-artist') {
    return [
      { role: 'display', maxLines: 1 },
      { role: 'title', maxLines: 2 },
    ];
  }
  return [
    { role: 'display', maxLines: 2 },
    { role: 'title', maxLines: 2 },
  ];
}
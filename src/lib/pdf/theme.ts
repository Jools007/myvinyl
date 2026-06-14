/** Warm editorial palette — matches MyVinyl cream/charcoal/teal, no cold blues. */
export const PDF_COLORS = {
  ink: [28, 25, 22] as const,
  inkMid: [69, 64, 54] as const,
  inkSoft: [111, 103, 92] as const,
  paper: [252, 250, 246] as const,
  paperMuted: [245, 241, 235] as const,
  rowStripe: [250, 247, 242] as const,
  line: [224, 216, 204] as const,
  accent: [21, 101, 94] as const,
  accentWarm: [180, 134, 78] as const,
  accentSoft: [237, 229, 218] as const,
  cover: [32, 28, 24] as const,
  coverMid: [48, 42, 36] as const,
  coverInk: [252, 248, 242] as const,
  coverMuted: [196, 184, 168] as const,
  white: [255, 255, 255] as const,
  tableHead: [42, 38, 34] as const,
};

export const CHART_RGB: readonly (readonly [number, number, number])[] = [
  PDF_COLORS.accent,
  PDF_COLORS.accentWarm,
  [139, 107, 74],
  [92, 74, 58],
  [21, 101, 94],
  [160, 128, 96],
];

export const PAGE = {
  w: 210,
  h: 297,
  margin: 12,
  footerH: 10,
  headerH: 9,
  gutter: 3,
};

export const CONTENT_W = PAGE.w - PAGE.margin * 2;
export const CONTENT_TOP = PAGE.margin + PAGE.headerH + 1;
export const CONTENT_BOTTOM = PAGE.h - PAGE.footerH;

export const CATALOG = {
  rowH: 7,
  headerH: 8,
  letterH: 5,
  art: 8,
  cols: {
    num: 7,
    art: 9,
    artist: 36,
    title: 44,
    year: 11,
    format: 17,
    cond: 13,
    bpm: 13,
    key: 11,
    genre: 25,
  },
} as const;

export const BANNER = {
  catalog: { w: 1600, h: 260 },
  insights: { w: 1600, h: 260 },
  dj: { w: 1600, h: 260 },
  cover: { w: 1200, h: 900 },
} as const;

export function colX(start: number, widths: number[], index: number): number {
  let x = start;
  for (let i = 0; i < index; i++) x += widths[i];
  return x;
}
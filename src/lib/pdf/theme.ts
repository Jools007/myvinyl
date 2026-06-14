/** MyVinyl editorial palette — print-safe, matches app accent. */
export const PDF_COLORS = {
  ink: [28, 25, 22] as const,
  inkMid: [69, 64, 54] as const,
  inkSoft: [111, 103, 92] as const,
  paper: [252, 251, 249] as const,
  paperMuted: [245, 243, 238] as const,
  line: [226, 220, 210] as const,
  accent: [21, 101, 94] as const,
  accentSoft: [204, 251, 241] as const,
  cover: [12, 18, 34] as const,
  coverInk: [244, 243, 241] as const,
  white: [255, 255, 255] as const,
};

export const CHART_RGB: readonly (readonly [number, number, number])[] = [
  PDF_COLORS.accent,
  [79, 70, 229],
  [224, 123, 84],
  [30, 41, 59],
  [56, 189, 248],
  [167, 139, 250],
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

export function colX(start: number, widths: number[], index: number): number {
  let x = start;
  for (let i = 0; i < index; i++) x += widths[i];
  return x;
}
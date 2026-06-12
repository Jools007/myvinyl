import {
  computeCollectionInsights,
  groupRecordsByGenre,
  type CollectionInsights,
  type GenreGroup,
} from './collectionInsights';
import { resolveDiscogsCoverUrl } from './discogsCover';
import { normalizeFormat, normalizeGenre } from './filterLabels';
import { getPrimaryTrack } from './types';
import type { VinylRecord } from './types';

export { groupRecordsByGenre } from './collectionInsights';

type RichInsights = CollectionInsights & { introParagraphs: string[] };

export type CollectionPdfExportOptions = {
  records: VinylRecord[];
  totalInCollection: number;
  collectionName?: string;
  curatorName?: string;
  filterNote?: string;
  generatedAt?: Date;
  onProgress?: (message: string) => void;
};

type ImageCache = Map<string, string | null>;

type ChartItem = { label: string; count: number };

/** Editorial palette — confident, readable, print-safe. */
const COLORS = {
  navy: [12, 18, 34] as const,
  navySoft: [30, 41, 59] as const,
  teal: [13, 148, 136] as const,
  tealSoft: [204, 251, 241] as const,
  indigo: [79, 70, 229] as const,
  coral: [249, 115, 22] as const,
  ink: [15, 23, 42] as const,
  inkMid: [51, 65, 85] as const,
  inkSoft: [100, 116, 139] as const,
  paper: [252, 252, 250] as const,
  paperMuted: [241, 245, 249] as const,
  paperLine: [226, 232, 240] as const,
  white: [255, 255, 255] as const,
  slate: [148, 163, 184] as const,
};

const CHART_COLORS: readonly (readonly [number, number, number])[] = [
  COLORS.teal,
  COLORS.indigo,
  COLORS.coral,
  COLORS.navySoft,
  [56, 189, 248],
  [167, 139, 250],
  [251, 191, 36],
  [244, 114, 182],
];

const PAGE = {
  w: 210,
  h: 297,
  margin: 14,
  footer: 12,
  header: 8,
  gutter: 4,
};

const LAYOUT = {
  listRowH: 20,
  listArt: 15,
  listPad: 3,
  detailArt: 30,
  detailPad: 5,
  detailFooterH: 5,
  letterHeaderH: 9,
  coverMosaicH: 64,
};

const CONTENT_W = PAGE.w - PAGE.margin * 2;
const COL_HALF = (CONTENT_W - PAGE.gutter) / 2;
const CONTENT_BOTTOM = PAGE.h - PAGE.footer;
const CONTENT_TOP = PAGE.margin + PAGE.header + 2;

function sortRecords(a: VinylRecord, b: VinylRecord): number {
  const artist = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
  if (artist !== 0) return artist;
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

function imageProxyUrl(sourceUrl: string): string {
  return `/api/image?url=${encodeURIComponent(sourceUrl)}`;
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function buildIntroParagraphs(
  insights: CollectionInsights,
  collectionName: string,
  curatorName?: string
): string[] {
  const curator = curatorName ?? 'the curator';
  const paragraphs: string[] = [];

  paragraphs.push(
    `${collectionName} is more than a spreadsheet of pressings — it is a curated listening universe, documented here as a premium vinyl catalog. Every sleeve in these pages represents a deliberate choice: a moment in musical history, a groove worth keeping, and a physical object that still matters in an age of streams. This document distils that crate into something you can hold, annotate, and browse without a screen.`
  );

  paragraphs.push(
    `At scale, the library holds ${insights.releaseCount} releases by ${insights.artistCount} artists, indexing ${insights.trackCount} individual tracks organised across ${insights.genreCount} genre chapters. ${
      insights.yearRange
        ? `Pressings stretch from ${insights.oldestYear ?? '—'} to ${insights.newestYear ?? '—'} (${insights.yearRange}), with a median year of ${insights.medianYear ?? '—'} — a timeline that maps how tastes have evolved over decades.`
        : 'Pressing years vary widely, reflecting an eclectic appetite rather than a single era.'
    } Each release averages ${insights.avgTracksPerRelease} tracks, ${
      insights.avgTracksPerRelease >= 10
        ? 'pointing toward full albums, compilations, and DJ-friendly doubles.'
        : 'leaning toward singles, EPs, and tightly focused releases.'
    }`
  );

  const character: string[] = [];
  if (insights.topGenre) {
    character.push(
      `${insights.topGenre.name} anchors the collection (${insights.topGenre.count} appearances, ${pct(insights.topGenre.count, insights.releaseCount)} of releases)`
    );
  }
  if (insights.topArtist && insights.topArtist.count > 1) {
    character.push(
      `${insights.topArtist.name} is the most represented artist (${insights.topArtist.count} copies)`
    );
  }
  if (insights.formatCounts[0]) {
    character.push(
      `${insights.formatCounts[0].label} is the dominant format (${insights.formatCounts[0].count} items)`
    );
  }
  paragraphs.push(
    character.length > 0
      ? `The sonic fingerprint is distinctive: ${character.join('; ')}. Together these choices reveal a collector who knows what they are building — not a random accumulation, but a library with gravity and direction.`
      : 'The collection reads as an eclectic, listener-led archive — wide-ranging in style but unified by personal taste rather than chart fashion.'
  );

  const djBits: string[] = [];
  if (insights.avgBpm != null) {
    djBits.push(
      `average tempo sits at ${insights.avgBpm} BPM (${insights.energyLabel.toLowerCase()})`
    );
  }
  if (insights.withBpmCount > 0) {
    djBits.push(`${insights.withBpmCount} releases carry BPM data for mix planning`);
  }
  if (insights.withKeyCount > 0) {
    djBits.push(`${insights.withKeyCount} primary tracks include harmonic key data`);
  }
  if (insights.vibeCounts.length > 0) {
    djBits.push(
      `vibe tags cluster around ${insights.vibeCounts
        .slice(0, 3)
        .map((v) => v.label)
        .join(', ')}`
    );
  }
  paragraphs.push(
    djBits.length > 0
      ? `For DJs and serious listeners, the catalog doubles as a reference deck: ${djBits.join('; ')}. Whether you are beat-matching, programming a night, or simply chasing a mood, these metadata layers turn a shelf into a toolkit.`
      : 'Musical metadata is still growing across the library — BPM, key, and vibe tags can be enriched over time to sharpen DJ and discovery workflows.'
  );

  paragraphs.push(
    `On the shelf, ${insights.mintCount} copies are graded Mint or Near Mint, and ${insights.playedCount} releases show recent spins — evidence of a collection that is loved, not merely displayed. ${insights.discogsLinkedCount} releases link to Discogs catalog IDs, keeping provenance and market context one click away. ${
      insights.importAddCount > 0
        ? `${insights.importAddCount} arrived via Discogs import and ${insights.manualAddCount} were added manually — a blend of digital convenience and hands-on curation.`
        : 'Each entry was added with intention, building the archive record by record.'
    }`
  );

  paragraphs.push(
    `How to read this PDF: the analytics section surfaces patterns your eyes might miss on a shelf; the A–Z index is a visual quick-scan with sleeve art; the detailed catalog breaks everything down by genre with tracklists and notes. Compiled for ${curator} with MyVinyl on ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}. However you use it — crate digging, set planning, insurance inventory, or quiet bragging — treat this as a living portrait of a record collection with a point of view.`
  );

  return paragraphs;
}

function loadCoverFromImageElement(url: string, maxSize = 240): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(drawSquareCover(img, maxSize));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadCoverDataUrl(sourceUrl: string): Promise<string | null> {
  const directUrl = resolveDiscogsCoverUrl(sourceUrl);
  if (!directUrl) return null;

  // Discogs CDN blocks datacenter fetches; browsers can load covers directly in <img>.
  const fromBrowser = await loadCoverFromImageElement(directUrl);
  if (fromBrowser) return fromBrowser;

  try {
    const response = await fetch(imageProxyUrl(directUrl), { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await blobToJpegDataUrl(blob, 240);
  } catch {
    return null;
  }
}

function blobToJpegDataUrl(blob: Blob, maxSize: number): Promise<string | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(drawSquareCover(img, maxSize));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

function drawSquareCover(img: HTMLImageElement, maxSize: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, maxSize, maxSize);
  const scale = Math.max(maxSize / img.width, maxSize / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
  try {
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}

function renderDonutChartDataUrl(
  items: ChartItem[],
  sizePx: number
): string | null {
  if (items.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const total = items.reduce((sum, i) => sum + i.count, 0);
  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const outerR = sizePx * 0.42;
  const innerR = sizePx * 0.26;
  let angle = -Math.PI / 2;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, sizePx, sizePx);

  for (let i = 0; i < items.length; i++) {
    const slice = (items[i].count / total) * Math.PI * 2;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.fill();
    angle += slice;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${Math.round(sizePx * 0.11)}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(total), cx, cy - sizePx * 0.04);
  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.round(sizePx * 0.055)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('releases', cx, cy + sizePx * 0.07);

  try {
    return canvas.toDataURL('image/png', 1);
  } catch {
    return null;
  }
}

async function preloadCoverImages(
  records: VinylRecord[],
  onProgress?: (message: string) => void
): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  const urls = [
    ...new Set(
      records
        .map((r) => resolveDiscogsCoverUrl(r.coverUrl))
        .filter((url): url is string => Boolean(url))
    ),
  ];

  onProgress?.(`Fetching ${urls.length} sleeve${urls.length === 1 ? '' : 's'}…`);

  for (let i = 0; i < urls.length; i += 8) {
    const chunk = urls.slice(i, i + 8);
    await Promise.all(chunk.map(async (url) => cache.set(url, await loadCoverDataUrl(url))));
    onProgress?.(`Artwork ${Math.min(i + chunk.length, urls.length)} / ${urls.length}`);
  }

  return cache;
}

function coverForRecord(record: VinylRecord, cache: ImageCache): string | null {
  const url = resolveDiscogsCoverUrl(record.coverUrl);
  if (!url) return null;
  return cache.get(url) ?? null;
}

function fileDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatGeneratedLabel(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

function formatLastPlayed(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type PdfContext = {
  doc: import('jspdf').jsPDF;
  y: number;
  page: number;
  collectionName: string;
  imageCache: ImageCache;
};

function setFill(doc: import('jspdf').jsPDF, rgb: readonly [number, number, number]): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setText(doc: import('jspdf').jsPDF, rgb: readonly [number, number, number]): void {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setDraw(doc: import('jspdf').jsPDF, rgb: readonly [number, number, number]): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function drawPageHeader(ctx: PdfContext): void {
  const { doc, collectionName } = ctx;
  setFill(doc, COLORS.paper);
  doc.rect(0, 0, PAGE.w, CONTENT_TOP - 2, 'F');
  setFill(doc, COLORS.teal);
  doc.rect(PAGE.margin, PAGE.margin, 18, 0.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  setText(doc, COLORS.inkMid);
  doc.text(collectionName.toUpperCase(), PAGE.margin + 20, PAGE.margin + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setText(doc, COLORS.inkSoft);
  doc.text('Collection catalog', PAGE.w - PAGE.margin, PAGE.margin + 3, { align: 'right' });
}

function drawPageFooter(ctx: PdfContext): void {
  const { doc, page, collectionName } = ctx;
  const y = PAGE.h - 5;
  setDraw(doc, COLORS.paperLine);
  doc.setLineWidth(0.1);
  doc.line(PAGE.margin, y - 3, PAGE.w - PAGE.margin, y - 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, COLORS.inkSoft);
  doc.text(`MyVinyl  ·  ${collectionName}`, PAGE.margin, y);
  doc.text(`${page}`, PAGE.w - PAGE.margin, y, { align: 'right' });
}

function newPage(ctx: PdfContext): void {
  drawPageFooter(ctx);
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = CONTENT_TOP;
  drawPageHeader(ctx);
}

function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.y + needed <= CONTENT_BOTTOM) return;
  newPage(ctx);
}

function drawSectionTitle(ctx: PdfContext, title: string, subtitle?: string): void {
  ensureSpace(ctx, subtitle ? 16 : 12);
  const { doc } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setText(doc, COLORS.ink);
  doc.text(title, PAGE.margin, ctx.y);
  ctx.y += 5;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, COLORS.inkSoft);
    doc.text(subtitle, PAGE.margin, ctx.y + 2);
    ctx.y += 8;
  } else {
    ctx.y += 4;
  }
}

function drawParagraphs(ctx: PdfContext, paragraphs: string[]): void {
  const { doc } = ctx;
  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, CONTENT_W) as string[];
    const blockH = lines.length * 4.2 + 5;
    ensureSpace(ctx, blockH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, COLORS.inkMid);
    doc.text(lines, PAGE.margin, ctx.y);
    ctx.y += blockH;
  }
}

function drawStatTiles(ctx: PdfContext, tiles: [string, string][]): void {
  const { doc } = ctx;
  const cols = 3;
  const tileW = (CONTENT_W - PAGE.gutter * (cols - 1)) / cols;
  const tileH = 16;
  const rows = Math.ceil(tiles.length / cols);
  ensureSpace(ctx, rows * (tileH + 3) + 2);

  tiles.forEach(([label, value], index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = PAGE.margin + col * (tileW + PAGE.gutter);
    const y = ctx.y + row * (tileH + 3);

    setFill(doc, COLORS.paperMuted);
    doc.roundedRect(x, y, tileW, tileH, 1.5, 1.5, 'F');
    setDraw(doc, COLORS.paperLine);
    doc.setLineWidth(0.1);
    doc.roundedRect(x, y, tileW, tileH, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setText(doc, COLORS.teal);
    doc.text(value, x + 3, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    setText(doc, COLORS.inkSoft);
    doc.text(label.toUpperCase(), x + 3, y + 13);
  });

  ctx.y += rows * (tileH + 3) + 4;
}

function drawHorizontalBarChart(
  ctx: PdfContext,
  title: string,
  items: ChartItem[],
  barColor: readonly [number, number, number],
  opts?: { x?: number; width?: number; labelWidth?: number }
): void {
  if (items.length === 0) return;
  const { doc } = ctx;
  const x0 = opts?.x ?? PAGE.margin;
  const chartW = opts?.width ?? CONTENT_W;
  const labelWidth = opts?.labelWidth ?? 36;
  const rowH = 6.5;
  const chartH = 10 + items.length * rowH;
  ensureSpace(ctx, chartH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, COLORS.ink);
  doc.text(title, x0, ctx.y);
  ctx.y += 6;

  const max = Math.max(...items.map((i) => i.count));
  const barMaxW = chartW - labelWidth - 14;

  for (const item of items) {
    const barW = Math.max(2, (item.count / max) * barMaxW);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COLORS.inkMid);
    const label = doc.splitTextToSize(item.label, labelWidth - 2)[0] as string;
    doc.text(label, x0, ctx.y + 3);

    setFill(doc, COLORS.paperLine);
    doc.roundedRect(x0 + labelWidth, ctx.y, barMaxW, 4, 1, 1, 'F');
    setFill(doc, barColor);
    doc.roundedRect(x0 + labelWidth, ctx.y, barW, 4, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setText(doc, COLORS.inkSoft);
    doc.text(String(item.count), x0 + labelWidth + barMaxW + 3, ctx.y + 3);

    ctx.y += rowH;
  }

  ctx.y += 4;
}

function drawDecadeTimeline(ctx: PdfContext, items: ChartItem[]): void {
  if (items.length === 0) return;
  const { doc } = ctx;
  const blockH = 28;
  ensureSpace(ctx, blockH + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, COLORS.ink);
  doc.text('Pressing timeline', PAGE.margin, ctx.y);
  ctx.y += 6;

  const max = Math.max(...items.map((i) => i.count));
  const blockW = (CONTENT_W - PAGE.gutter * (items.length - 1)) / items.length;
  const baseY = ctx.y + 18;

  items.forEach((item, i) => {
    const h = Math.max(4, (item.count / max) * 16);
    const x = PAGE.margin + i * (blockW + PAGE.gutter);
    const y = baseY - h;

    setFill(doc, CHART_COLORS[i % CHART_COLORS.length]);
    doc.roundedRect(x, y, blockW, h, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setText(doc, COLORS.ink);
    doc.text(String(item.count), x + blockW / 2, y - 2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    setText(doc, COLORS.inkSoft);
    doc.text(item.label, x + blockW / 2, baseY + 3, { align: 'center' });
  });

  ctx.y += blockH + 6;
}

function drawDonutWithLegend(
  ctx: PdfContext,
  title: string,
  items: ChartItem[],
  dataUrl: string | null
): void {
  if (items.length === 0 || !dataUrl) return;
  const { doc } = ctx;
  const blockH = 52;
  ensureSpace(ctx, blockH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, COLORS.ink);
  doc.text(title, PAGE.margin, ctx.y);

  const donutSize = 38;
  const donutY = ctx.y + 4;
  try {
    doc.addImage(dataUrl, 'PNG', PAGE.margin, donutY, donutSize, donutSize, undefined, 'FAST');
  } catch {
    return;
  }

  const legendX = PAGE.margin + donutSize + 8;
  let legendY = donutY + 6;
  const total = items.reduce((sum, i) => sum + i.count, 0);

  for (let i = 0; i < Math.min(items.length, 6); i++) {
    const item = items[i];
    setFill(doc, CHART_COLORS[i % CHART_COLORS.length]);
    doc.circle(legendX, legendY, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COLORS.inkMid);
    const share = pct(item.count, total);
    doc.text(`${item.label}  (${share})`, legendX + 4, legendY + 1);
    legendY += 5.5;
  }

  ctx.y += blockH + 2;
}

function drawSleevePlaceholder(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  size: number
): void {
  setFill(doc, COLORS.navySoft);
  doc.roundedRect(x, y, size, size, 0.8, 0.8, 'F');
  const cx = x + size / 2;
  const cy = y + size / 2;
  setDraw(doc, COLORS.teal);
  doc.setLineWidth(0.15);
  doc.circle(cx, cy, size * 0.26, 'S');
  setFill(doc, COLORS.teal);
  doc.circle(cx, cy, size * 0.07, 'F');
}

function drawArtwork(
  ctx: PdfContext,
  record: VinylRecord,
  x: number,
  y: number,
  size: number
): void {
  const { doc } = ctx;
  const dataUrl = coverForRecord(record, ctx.imageCache);

  setFill(doc, COLORS.paperLine);
  doc.roundedRect(x, y, size, size, 0.8, 0.8, 'F');

  if (dataUrl) {
    try {
      doc.addImage(dataUrl, 'JPEG', x + 0.3, y + 0.3, size - 0.6, size - 0.6, undefined, 'FAST');
    } catch {
      drawSleevePlaceholder(doc, x + 0.3, y + 0.3, size - 0.6);
    }
  } else {
    drawSleevePlaceholder(doc, x + 0.3, y + 0.3, size - 0.6);
  }

  setDraw(doc, COLORS.paperLine);
  doc.setLineWidth(0.1);
  doc.roundedRect(x, y, size, size, 0.8, 0.8, 'S');
}

function drawCoverPage(
  ctx: PdfContext,
  options: CollectionPdfExportOptions,
  insights: RichInsights
): void {
  const { doc } = ctx;
  const collectionName = options.collectionName ?? 'Jools Collection';
  const generatedAt = options.generatedAt ?? new Date();

  setFill(doc, COLORS.navy);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');

  const picks = options.records.filter((r) => coverForRecord(r, ctx.imageCache)).slice(0, 8);
  const cols = 4;
  const tileW = PAGE.w / cols;
  const tileH = LAYOUT.coverMosaicH / 2;

  for (let i = 0; i < picks.length; i++) {
    const dataUrl = coverForRecord(picks[i], ctx.imageCache);
    if (!dataUrl) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    try {
      doc.addImage(
        dataUrl,
        'JPEG',
        col * tileW + 0.5,
        row * tileH + 0.5,
        tileW - 1,
        tileH - 1,
        undefined,
        'FAST'
      );
    } catch {
      /* skip */
    }
  }

  for (let i = 0; i < 6; i++) {
    const alpha = i / 5;
    const shade = Math.round(12 + alpha * 18);
    setFill(doc, [shade, shade + 6, shade + 22] as const);
    const bandY = LAYOUT.coverMosaicH - 6 + i;
    doc.rect(0, bandY, PAGE.w, 1.2, 'F');
  }

  setFill(doc, COLORS.navy);
  doc.rect(0, LAYOUT.coverMosaicH, PAGE.w, PAGE.h - LAYOUT.coverMosaicH, 'F');

  const heroY = LAYOUT.coverMosaicH + 12;
  setFill(doc, COLORS.teal);
  doc.rect(PAGE.margin, heroY, 40, 0.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  setText(doc, COLORS.white);
  doc.text(collectionName.toUpperCase(), PAGE.margin, heroY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setText(doc, COLORS.tealSoft);
  doc.text('The complete vinyl catalog', PAGE.margin, heroY + 18);

  if (options.curatorName) {
    doc.setFontSize(8);
    setText(doc, COLORS.white);
    doc.text(`Curated by ${options.curatorName}`, PAGE.margin, heroY + 25);
  }

  doc.setFontSize(7);
  setText(doc, COLORS.slate);
  doc.text(formatGeneratedLabel(generatedAt), PAGE.margin, heroY + 31);
  doc.text(insights.energyLabel, PAGE.margin, heroY + 37);

  const tiles: [string, string][] = [
    ['Releases', String(insights.releaseCount)],
    ['Artists', String(insights.artistCount)],
    ['Tracks', String(insights.trackCount)],
    ['Genres', String(insights.genreCount)],
    ['Median year', insights.medianYear != null ? String(insights.medianYear) : '—'],
    ['Avg BPM', insights.avgBpm != null ? String(insights.avgBpm) : '—'],
  ];

  const tileW2 = (CONTENT_W - PAGE.gutter * 2) / 3;
  const baseY = heroY + 46;
  tiles.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = PAGE.margin + col * (tileW2 + PAGE.gutter);
    const y = baseY + row * 14;
    setFill(doc, COLORS.navySoft);
    doc.roundedRect(x, y, tileW2, 11, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setText(doc, COLORS.tealSoft);
    doc.text(value, x + 3, y + 6);
    doc.setFontSize(5.8);
    setText(doc, COLORS.slate);
    doc.text(label.toUpperCase(), x + 3, y + 9.5);
  });

  drawPageFooter(ctx);
}

function drawContentsPage(ctx: PdfContext, insights: RichInsights): void {
  newPage(ctx);
  drawSectionTitle(ctx, 'Contents', 'Your guide to this catalog');

  const sections: [string, string][] = [
    ['Introduction', 'A written portrait of the collection'],
    ['Collection analytics', `${insights.releaseCount} releases · stats & charts`],
    ['A–Z Index', 'Visual quick reference with sleeve art'],
    ['Detailed catalog', `${insights.genreCount} genre chapters with tracklists`],
  ];

  const { doc } = ctx;
  for (const [title, desc] of sections) {
    ensureSpace(ctx, 14);
    setFill(doc, COLORS.paperMuted);
    doc.roundedRect(PAGE.margin, ctx.y, CONTENT_W, 12, 2, 2, 'F');
    setFill(doc, COLORS.teal);
    doc.rect(PAGE.margin, ctx.y, 2.5, 12, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(doc, COLORS.ink);
    doc.text(title, PAGE.margin + 6, ctx.y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, COLORS.inkSoft);
    doc.text(desc, PAGE.margin + 6, ctx.y + 9.5);

    ctx.y += 15;
  }

  drawPageFooter(ctx);
}

function drawIntroduction(ctx: PdfContext, insights: RichInsights, filterNote?: string): void {
  newPage(ctx);
  drawSectionTitle(ctx, 'Introduction', 'A written portrait of this crate');

  const { doc } = ctx;
  setFill(doc, COLORS.tealSoft);
  const pullQuote = doc.splitTextToSize(insights.energyLabel, CONTENT_W - 8) as string[];
  const quoteH = pullQuote.length * 5 + 8;
  ensureSpace(ctx, quoteH);
  doc.roundedRect(PAGE.margin, ctx.y, CONTENT_W, quoteH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, COLORS.teal);
  doc.text(pullQuote, PAGE.margin + 4, ctx.y + 7);
  ctx.y += quoteH + 6;

  drawParagraphs(ctx, insights.introParagraphs);

  if (filterNote) {
    ensureSpace(ctx, 12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    setText(doc, COLORS.inkSoft);
    const lines = doc.splitTextToSize(`Note: this export reflects active filters — ${filterNote}`, CONTENT_W);
    doc.text(lines, PAGE.margin, ctx.y);
    ctx.y += lines.length * 3.5 + 4;
  }

  drawPageFooter(ctx);
}

function drawAnalytics(ctx: PdfContext, insights: RichInsights, donutDataUrl: string | null): void {
  newPage(ctx);
  drawSectionTitle(ctx, 'Collection analytics', 'Stats and charts drawn from your library');

  drawStatTiles(ctx, [
    ['Releases', String(insights.releaseCount)],
    ['Artists', String(insights.artistCount)],
    ['Tracks', String(insights.trackCount)],
    ['Genres', String(insights.genreCount)],
    ['Near-mint', String(insights.mintCount)],
    ['With BPM', String(insights.withBpmCount)],
    ['With key', String(insights.withKeyCount)],
    ['Recently played', String(insights.playedCount)],
    ['Discogs linked', String(insights.discogsLinkedCount)],
    ['Avg tracks / release', String(insights.avgTracksPerRelease)],
    ['Pressing era', insights.yearRange ?? '—'],
    ['Energy profile', insights.energyLabel],
  ]);

  drawDonutWithLegend(ctx, 'Genre share', insights.topGenres.slice(0, 6), donutDataUrl);

  if (insights.decadeCounts.length > 0) {
    drawDecadeTimeline(ctx, insights.decadeCounts);
  }

  const chartStartY = ctx.y;
  drawHorizontalBarChart(ctx, 'Top genres', insights.topGenres, COLORS.teal, {
    x: PAGE.margin,
    width: COL_HALF,
    labelWidth: 28,
  });
  const leftEndY = ctx.y;

  ctx.y = chartStartY;
  drawHorizontalBarChart(ctx, 'Top artists', insights.topArtists, COLORS.indigo, {
    x: PAGE.margin + COL_HALF + PAGE.gutter,
    width: COL_HALF,
    labelWidth: 28,
  });
  ctx.y = Math.max(leftEndY, ctx.y);

  if (insights.formatCounts.length > 0) {
    drawHorizontalBarChart(ctx, 'Format breakdown', insights.formatCounts, COLORS.navySoft);
  }
  if (insights.bpmBuckets.length > 0) {
    drawHorizontalBarChart(ctx, 'BPM distribution', insights.bpmBuckets, COLORS.teal);
  }
  if (insights.conditionCounts.length > 0) {
    drawHorizontalBarChart(ctx, 'Condition grades', insights.conditionCounts, COLORS.indigo);
  }
  if (insights.keyCounts.length > 0) {
    drawHorizontalBarChart(ctx, 'Musical keys (primary tracks)', insights.keyCounts, COLORS.coral);
  }
  if (insights.vibeCounts.length > 0) {
    drawHorizontalBarChart(ctx, 'Vibe tags', insights.vibeCounts, COLORS.coral);
  }

  drawPageFooter(ctx);
}

function drawLetterHeader(ctx: PdfContext, letter: string, count: number): void {
  ensureSpace(ctx, LAYOUT.letterHeaderH + 2);
  const { doc } = ctx;
  setFill(doc, COLORS.navy);
  doc.roundedRect(PAGE.margin, ctx.y, CONTENT_W, LAYOUT.letterHeaderH, 1.5, 1.5, 'F');
  setFill(doc, COLORS.teal);
  doc.rect(PAGE.margin, ctx.y, 3, LAYOUT.letterHeaderH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, COLORS.white);
  doc.text(letter, PAGE.margin + 6, ctx.y + 5.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setText(doc, COLORS.tealSoft);
  doc.text(`${count} release${count === 1 ? '' : 's'}`, PAGE.w - PAGE.margin - 2, ctx.y + 5.8, {
    align: 'right',
  });
  ctx.y += LAYOUT.letterHeaderH + 2;
}

function drawListRow(ctx: PdfContext, record: VinylRecord, rowIndex: number): void {
  ensureSpace(ctx, LAYOUT.listRowH + 1);
  const { doc } = ctx;
  const y = ctx.y;
  const x = PAGE.margin;
  const w = CONTENT_W;

  setFill(doc, rowIndex % 2 === 0 ? COLORS.paper : COLORS.paperMuted);
  doc.roundedRect(x, y, w, LAYOUT.listRowH, 1.2, 1.2, 'F');
  setDraw(doc, COLORS.paperLine);
  doc.setLineWidth(0.08);
  doc.roundedRect(x, y, w, LAYOUT.listRowH, 1.2, 1.2, 'S');

  const artX = x + LAYOUT.listPad;
  const artY = y + (LAYOUT.listRowH - LAYOUT.listArt) / 2;
  drawArtwork(ctx, record, artX, artY, LAYOUT.listArt);

  const textX = artX + LAYOUT.listArt + 3;
  const textW = w - LAYOUT.listArt - LAYOUT.listPad * 2 - 3;
  const artistY = y + 5.5;
  const titleY = y + 9.5;
  const metaY = y + 13.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setText(doc, COLORS.ink);
  const artist = (doc.splitTextToSize(record.artist, textW - 18)[0] as string) ?? record.artist;
  doc.text(artist, textX, artistY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  setText(doc, COLORS.inkMid);
  const title = (doc.splitTextToSize(record.title, textW)[0] as string) ?? record.title;
  doc.text(title, textX, titleY);

  doc.setFontSize(5.8);
  setText(doc, COLORS.inkSoft);
  const primary = getPrimaryTrack(record);
  const meta = [
    record.year,
    record.format ? normalizeFormat(record.format) : null,
    record.condition,
    primary?.bpm != null ? `${primary.bpm} BPM` : null,
    primary?.camelotKey ?? primary?.musicalKey,
  ]
    .filter(Boolean)
    .join('  ·  ');
  doc.text(meta, textX, metaY);

  if (record.genres.length > 0) {
    const genre = normalizeGenre(record.genres[0]);
    const pillW = Math.min(28, doc.getTextWidth(genre) + 4);
    const pillX = x + w - LAYOUT.listPad - pillW;
    const pillY = y + 3.5;
    setFill(doc, COLORS.tealSoft);
    doc.roundedRect(pillX, pillY, pillW, 4.5, 1, 1, 'F');
    doc.setFontSize(5.2);
    setText(doc, COLORS.teal);
    doc.text(genre, pillX + 2, pillY + 3.2);
  }

  ctx.y += LAYOUT.listRowH + 1;
}

function drawAlphabeticalIndex(ctx: PdfContext, records: VinylRecord[]): void {
  newPage(ctx);
  drawSectionTitle(
    ctx,
    'A–Z Index',
    'Alphabetical quick reference — sleeve art, artist, title, and essentials'
  );

  const sorted = [...records].sort(sortRecords);
  const letterCounts = new Map<string, number>();
  for (const record of sorted) {
    const letter = (record.artist.trim()[0] ?? '#').toUpperCase();
    letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1);
  }

  let currentLetter = '';
  let rowIndex = 0;

  for (const record of sorted) {
    const letter = (record.artist.trim()[0] ?? '#').toUpperCase();
    if (letter !== currentLetter) {
      drawLetterHeader(ctx, letter, letterCounts.get(letter) ?? 1);
      currentLetter = letter;
      rowIndex = 0;
    }
    drawListRow(ctx, record, rowIndex);
    rowIndex += 1;
  }

  drawPageFooter(ctx);
}

function formatTrackPreview(record: VinylRecord, max = 4): string | null {
  if (record.tracks.length === 0) return null;
  const lines = record.tracks.slice(0, max).map((t) => {
    const pos = t.position ? `${t.position} ` : '';
    return `${pos}${t.title}`;
  });
  if (record.tracks.length > max) lines.push(`+${record.tracks.length - max} more`);
  return lines.join(' · ');
}

function measureDetailCard(ctx: PdfContext, record: VinylRecord): number {
  const { doc } = ctx;
  const textW = CONTENT_W - LAYOUT.detailArt - LAYOUT.detailPad * 3;
  const footerReserve = LAYOUT.detailFooterH + LAYOUT.detailPad;
  let contentH = LAYOUT.detailPad + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  contentH += 4;

  doc.setFontSize(10);
  contentH += (doc.splitTextToSize(record.title, textW).length as number) * 4;

  contentH += 5;
  doc.setFontSize(6.8);
  contentH += 4;

  if (record.genres.length > 0) contentH += 3.5;

  const preview = formatTrackPreview(record);
  if (preview) {
    doc.setFontSize(6.5);
    contentH += (doc.splitTextToSize(preview, textW).length as number) * 3 + 2;
  }
  if (record.notes?.trim()) {
    doc.setFontSize(6.5);
    contentH += (doc.splitTextToSize(record.notes.trim(), textW).length as number) * 3 + 2;
  }

  contentH += footerReserve;
  return Math.max(contentH, LAYOUT.detailArt + LAYOUT.detailPad * 2);
}

function drawGenreBanner(ctx: PdfContext, group: GenreGroup): void {
  ensureSpace(ctx, 14);
  const { doc } = ctx;
  setFill(doc, COLORS.navy);
  doc.roundedRect(PAGE.margin, ctx.y, CONTENT_W, 10, 1.5, 1.5, 'F');
  setFill(doc, COLORS.teal);
  doc.rect(PAGE.margin, ctx.y, 2, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setText(doc, COLORS.white);
  doc.text(group.genre, PAGE.margin + 5, ctx.y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setText(doc, COLORS.tealSoft);
  doc.text(`${group.records.length} releases`, PAGE.w - PAGE.margin - 2, ctx.y + 6.5, {
    align: 'right',
  });
  ctx.y += 13;
}

function drawDetailCard(ctx: PdfContext, record: VinylRecord): void {
  const cardH = measureDetailCard(ctx, record);
  ensureSpace(ctx, cardH + 2);

  const { doc } = ctx;
  const y0 = ctx.y;
  const textX = PAGE.margin + LAYOUT.detailArt + LAYOUT.detailPad * 2;
  const textW = CONTENT_W - LAYOUT.detailArt - LAYOUT.detailPad * 3;
  const footerY = y0 + cardH - LAYOUT.detailPad - 1;
  const contentBottom = footerY - LAYOUT.detailFooterH;

  setFill(doc, COLORS.paperMuted);
  doc.roundedRect(PAGE.margin, y0, CONTENT_W, cardH, 2, 2, 'F');
  setDraw(doc, COLORS.paperLine);
  doc.setLineWidth(0.1);
  doc.roundedRect(PAGE.margin, y0, CONTENT_W, cardH, 2, 2, 'S');

  drawArtwork(
    ctx,
    record,
    PAGE.margin + LAYOUT.detailPad,
    y0 + LAYOUT.detailPad,
    LAYOUT.detailArt
  );

  let textY = y0 + LAYOUT.detailPad + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setText(doc, COLORS.teal);
  doc.text(record.artist.toUpperCase(), textX, textY);
  textY += 4;

  doc.setFontSize(10);
  setText(doc, COLORS.ink);
  const titleLines = doc.splitTextToSize(record.title, textW) as string[];
  doc.text(titleLines, textX, textY);
  textY += titleLines.length * 4 + 2;

  const primary = getPrimaryTrack(record);
  const chips = [
    record.year,
    record.format ? normalizeFormat(record.format) : null,
    record.condition,
    primary?.bpm != null ? `${primary.bpm} BPM` : null,
    primary?.camelotKey ?? primary?.musicalKey,
  ]
    .filter(Boolean)
    .join('   ·   ');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  setText(doc, COLORS.inkMid);
  doc.text(chips, textX, textY);
  textY += 4;

  if (record.genres.length > 0) {
    doc.setFontSize(6.3);
    setText(doc, COLORS.indigo);
    doc.text(record.genres.map(normalizeGenre).join('   ·   '), textX, textY);
    textY += 3.5;
  }

  const preview = formatTrackPreview(record);
  if (preview && textY < contentBottom) {
    doc.setFontSize(6.5);
    setText(doc, COLORS.inkSoft);
    const lines = doc.splitTextToSize(preview, textW) as string[];
    const maxLines = Math.max(1, Math.floor((contentBottom - textY) / 3));
    doc.text(lines.slice(0, maxLines), textX, textY);
    textY += Math.min(lines.length, maxLines) * 3 + 1;
  }

  if (record.notes?.trim() && textY < contentBottom) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    setText(doc, COLORS.inkMid);
    const noteLines = doc.splitTextToSize(`"${record.notes.trim()}"`, textW) as string[];
    const maxLines = Math.max(1, Math.floor((contentBottom - textY) / 3));
    doc.text(noteLines.slice(0, maxLines), textX, textY);
  }

  const meta: string[] = [`${record.tracks.length} tracks`];
  if (record.discogsId) meta.push(`Discogs ${record.discogsId}`);
  const lastPlayed = formatLastPlayed(record.lastPlayedAt);
  if (lastPlayed) meta.push(`Last spun ${lastPlayed}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  setText(doc, COLORS.inkSoft);
  doc.text(meta.join('   ·   '), textX, footerY);

  ctx.y = y0 + cardH + 2;
}

function drawDetailedCatalog(ctx: PdfContext, groups: GenreGroup[]): void {
  newPage(ctx);
  drawSectionTitle(ctx, 'Detailed catalog', 'Full release pages organised by genre');

  for (const group of groups) {
    drawGenreBanner(ctx, group);
    for (const record of group.records) {
      drawDetailCard(ctx, record);
    }
    ctx.y += 2;
  }

  drawPageFooter(ctx);
}

export async function exportCollectionToPdf(options: CollectionPdfExportOptions): Promise<void> {
  if (options.records.length === 0) {
    throw new Error('No records to export');
  }

  const collectionName = options.collectionName ?? 'Jools Collection';
  options.onProgress?.('Preparing catalog…');

  const imageCache = await preloadCoverImages(options.records, options.onProgress);
  const groups = groupRecordsByGenre(options.records);
  const insightBase = computeCollectionInsights(options.records);
  const insights: RichInsights = {
    ...insightBase,
    introParagraphs: buildIntroParagraphs(insightBase, collectionName, options.curatorName),
  };

  const donutDataUrl = renderDonutChartDataUrl(insights.topGenres.slice(0, 6), 320);

  options.onProgress?.('Rendering PDF…');

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const ctx: PdfContext = {
    doc,
    y: PAGE.margin,
    page: 1,
    collectionName,
    imageCache,
  };

  drawCoverPage(ctx, options, insights);
  drawContentsPage(ctx, insights);
  drawIntroduction(ctx, insights, options.filterNote);
  drawAnalytics(ctx, insights, donutDataUrl);
  drawAlphabeticalIndex(ctx, options.records);
  drawDetailedCatalog(ctx, groups);

  const stamp = fileDateStamp(options.generatedAt ?? new Date());
  const slug = collectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  doc.save(`${slug || 'collection'}-${stamp}.pdf`);
}

export function buildCollectionFilterNote(
  filters: {
    query: string;
    format: string | null;
    genre: string | null;
    condition: string | null;
    vibe: string | null;
    bpmRangeId: string;
  },
  bpmLabel?: string
): string | undefined {
  const parts: string[] = [];
  if (filters.query.trim()) parts.push(`Search: "${filters.query.trim()}"`);
  if (filters.format) parts.push(`Format: ${filters.format}`);
  if (filters.genre) parts.push(`Genre: ${filters.genre}`);
  if (filters.condition) parts.push(`Condition: ${filters.condition}`);
  if (filters.vibe) parts.push(`Vibe: ${filters.vibe}`);
  if (filters.bpmRangeId !== 'all' && bpmLabel) parts.push(`BPM: ${bpmLabel}`);

  return parts.length > 0 ? parts.join('   ·   ') : undefined;
}
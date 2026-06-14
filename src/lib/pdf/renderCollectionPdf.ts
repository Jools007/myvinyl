import { jsPDF } from 'jspdf';
import {
  computeCollectionInsights,
  type ChartItem,
  type CollectionInsights,
} from '../collectionInsights';
import { normalizeFormat, normalizeGenre } from '../filterLabels';
import { resolveTrackCamelot } from '../camelot';
import { getPrimaryTrack, type VinylRecord } from '../types';
import { ensurePdfFonts, PDF_FONT } from './fonts';
import {
  BANNER,
  CATALOG,
  CHART_RGB,
  colX,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  CONTENT_W,
  PAGE,
  PDF_COLORS,
} from './theme';
import {
  assetFromCache,
  coverForRecord,
  PDF_ASSETS,
  preloadPdfImages,
  type CachedImage,
  type ImageCache,
} from './images';

export type CollectionPdfExportOptions = {
  records: VinylRecord[];
  totalInCollection: number;
  collectionName?: string;
  curatorName?: string;
  filterNote?: string;
  generatedAt?: Date;
  onProgress?: (message: string) => void;
};

type PdfContext = {
  doc: jsPDF;
  y: number;
  page: number;
  collectionName: string;
  imageCache: ImageCache;
  section?: string;
};

function setFill(doc: jsPDF, rgb: readonly [number, number, number]): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setText(doc: jsPDF, rgb: readonly [number, number, number]): void {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setDraw(doc: jsPDF, rgb: readonly [number, number, number]): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function truncate(doc: jsPDF, text: string, maxW: number): string {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxW) return text;
  let out = text;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function sortByArtist(records: VinylRecord[]): VinylRecord[] {
  return [...records].sort((a, b) => {
    const artist = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
    if (artist !== 0) return artist;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

function fileDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatGeneratedLabel(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

function drawPageHeader(ctx: PdfContext): void {
  const { doc, collectionName, section } = ctx;
  setFill(doc, PDF_COLORS.paper);
  doc.rect(0, 0, PAGE.w, CONTENT_TOP - 1, 'F');
  setFill(doc, PDF_COLORS.accent);
  doc.rect(PAGE.margin, PAGE.margin, 14, 0.45, 'F');

  doc.setFont(PDF_FONT.display, 'bold');
  doc.setFontSize(6.2);
  setText(doc, PDF_COLORS.inkMid);
  doc.text(collectionName.toUpperCase(), PAGE.margin + 16, PAGE.margin + 2.8);

  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(5.8);
  setText(doc, PDF_COLORS.inkSoft);
  const right = section ?? 'MyVinyl catalog';
  doc.text(right, PAGE.w - PAGE.margin, PAGE.margin + 2.8, { align: 'right' });
}

function drawPageFooter(ctx: PdfContext): void {
  const { doc, page, collectionName } = ctx;
  const y = PAGE.h - 4.5;
  setDraw(doc, PDF_COLORS.line);
  doc.setLineWidth(0.12);
  doc.line(PAGE.margin, y - 2.5, PAGE.w - PAGE.margin, y - 2.5);
  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(5.5);
  setText(doc, PDF_COLORS.inkSoft);
  doc.text(`MyVinyl  ·  ${collectionName}`, PAGE.margin, y);
  doc.text(String(page), PAGE.w - PAGE.margin, y, { align: 'right' });
}

function newPage(ctx: PdfContext, section?: string): void {
  drawPageFooter(ctx);
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = CONTENT_TOP;
  if (section) ctx.section = section;
  drawPageHeader(ctx);
}

function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.y + needed <= CONTENT_BOTTOM) return;
  newPage(ctx);
}

function placeImage(
  doc: jsPDF,
  image: CachedImage | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (!image) return;
  try {
    doc.addImage(image.dataUrl, image.format, x, y, w, h, undefined, 'FAST');
  } catch {
    /* skip broken asset */
  }
}

function placeRaster(
  doc: jsPDF,
  dataUrl: string | null,
  x: number,
  y: number,
  w: number,
  h: number,
  format: 'JPEG' | 'PNG' = 'PNG'
): void {
  if (!dataUrl) return;
  try {
    doc.addImage(dataUrl, format, x, y, w, h, undefined, 'FAST');
  } catch {
    /* skip broken asset */
  }
}

function bannerHeight(widthMm: number): number {
  return Math.round((widthMm * BANNER.catalog.h) / BANNER.catalog.w);
}

function renderBarChartImage(
  items: ChartItem[],
  widthPx: number,
  heightPx: number,
  accent: readonly [number, number, number]
): string | null {
  if (items.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#fcfaf6';
  ctx.fillRect(0, 0, widthPx, heightPx);

  const pad = 12;
  const labelW = Math.round(widthPx * 0.34);
  const barMax = widthPx - pad * 2 - labelW - 28;
  const rowH = (heightPx - pad * 2) / items.length;
  const max = Math.max(...items.map((i) => i.count));

  items.forEach((item, index) => {
    const y = pad + index * rowH + rowH * 0.22;
    const barW = Math.max(4, (item.count / max) * barMax);

    ctx.fillStyle = '#6f675c';
    ctx.font = '500 11px Inter, Helvetica, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label =
      item.label.length > 18 ? `${item.label.slice(0, 17)}…` : item.label;
    ctx.fillText(label, pad, y + rowH * 0.18);

    ctx.fillStyle = '#e2dcd0';
    ctx.fillRect(pad + labelW, y, barMax, Math.max(4, rowH * 0.36));
    ctx.fillStyle = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
    ctx.fillRect(pad + labelW, y, barW, Math.max(4, rowH * 0.36));

    ctx.fillStyle = '#454036';
    ctx.font = '600 10px Inter, Helvetica, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(item.count), pad + labelW + barMax + 6, y + rowH * 0.18);
  });

  try {
    return canvas.toDataURL('image/png', 1);
  } catch {
    return null;
  }
}

function drawCover(
  ctx: PdfContext,
  options: CollectionPdfExportOptions,
  insights: CollectionInsights
): void {
  const { doc } = ctx;
  const collectionName = options.collectionName ?? 'My Vinyl Collection';
  const generatedAt = options.generatedAt ?? new Date();
  const texture = assetFromCache(ctx.imageCache, PDF_ASSETS.coverTexture);
  const heroH = 98;

  setFill(doc, PDF_COLORS.cover);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');

  if (texture) {
    placeImage(doc, texture, 0, 0, PAGE.w, heroH);
  }

  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const shade = Math.round(32 + t * 18);
    setFill(doc, [shade, shade - 4, shade - 8] as const);
    doc.rect(0, heroH - 28 + i * 2.6, PAGE.w, 2.8, 'F');
  }

  const mosaic = options.records
    .filter((r) => coverForRecord(r, ctx.imageCache))
    .slice(0, 5);
  const tileSize = CONTENT_W / 5;
  const mosaicY = heroH - tileSize - 6;
  mosaic.forEach((record, i) => {
    const art = coverForRecord(record, ctx.imageCache);
    placeImage(doc, art, PAGE.margin + i * tileSize, mosaicY, tileSize - 1.2, tileSize - 1.2);
  });

  setFill(doc, PDF_COLORS.cover);
  doc.rect(0, heroH, PAGE.w, PAGE.h - heroH, 'F');

  const heroY = heroH + 10;
  setFill(doc, PDF_COLORS.accentWarm);
  doc.rect(PAGE.margin, heroY, 32, 0.55, 'F');

  doc.setFont(PDF_FONT.display, 'bold');
  doc.setFontSize(22);
  setText(doc, PDF_COLORS.coverInk);
  doc.text(collectionName, PAGE.margin, heroY + 11);

  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(9);
  setText(doc, PDF_COLORS.coverMuted);
  doc.text('Vinyl collection catalog', PAGE.margin, heroY + 18);

  doc.setFontSize(7);
  setText(doc, PDF_COLORS.coverMuted);
  if (options.curatorName) {
    doc.text(`Curated by ${options.curatorName}`, PAGE.margin, heroY + 24);
  }
  doc.text(formatGeneratedLabel(generatedAt), PAGE.margin, heroY + 29);

  const tiles: [string, string][] = [
    ['Releases', String(insights.releaseCount)],
    ['Artists', String(insights.artistCount)],
    ['Tracks', String(insights.trackCount)],
    ['Genres', String(insights.genreCount)],
    ['Median year', insights.medianYear != null ? String(insights.medianYear) : '—'],
    ['Energy', insights.energyLabel],
  ];

  const tileW2 = (CONTENT_W - PAGE.gutter * 2) / 3;
  const baseY = heroY + 36;
  tiles.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = PAGE.margin + col * (tileW2 + PAGE.gutter);
    const y = baseY + row * 13;
    setFill(doc, PDF_COLORS.coverMid);
    setDraw(doc, PDF_COLORS.accentWarm);
    doc.setLineWidth(0.15);
    doc.roundedRect(x, y, tileW2, 10, 1.2, 1.2, 'FD');
    doc.setFont(PDF_FONT.display, 'bold');
    doc.setFontSize(11);
    setText(doc, PDF_COLORS.coverInk);
    doc.text(value, x + 3, y + 5.5);
    doc.setFont(PDF_FONT.body, 'normal');
    doc.setFontSize(5.6);
    setText(doc, PDF_COLORS.coverMuted);
    doc.text(label.toUpperCase(), x + 3, y + 8.8);
  });

  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(6.5);
  setText(doc, PDF_COLORS.coverMuted);
  doc.text(
    'Master catalog sorted A–Z by artist  ·  Insights & DJ reference follow',
    PAGE.margin,
    PAGE.h - 14
  );

  drawPageFooter(ctx);
}

function drawPassport(ctx: PdfContext, insights: CollectionInsights, filterNote?: string): void {
  newPage(ctx, 'Collection passport');

  const insightsBanner = assetFromCache(ctx.imageCache, PDF_ASSETS.sectionInsights);
  const bannerH = bannerHeight(CONTENT_W);
  if (insightsBanner) {
    placeImage(ctx.doc, insightsBanner, PAGE.margin, ctx.y, CONTENT_W, bannerH);
    ctx.y += bannerH + 5;
  }

  docSectionTitle(ctx, 'Collection passport', 'At-a-glance insights from your library');

  drawStatStrip(ctx, [
    ['Releases', String(insights.releaseCount)],
    ['Named artists', String(insights.namedArtistCount)],
    ['Near-mint', `${insights.mintPct}%`],
    ['Played recently', `${insights.playedPct}%`],
    ['With BPM', String(insights.withBpmCount)],
    ['Enriched', `${insights.enrichmentPct}%`],
  ]);

  if (filterNote) {
    drawNoteBanner(ctx, `Filtered export — ${filterNote}`);
  }

  drawInsightColumns(ctx, insights);

  const chartW = (CONTENT_W - PAGE.gutter) / 2;
  const genreChart = renderBarChartImage(
    insights.topGenres.slice(0, 6),
    520,
    220,
    PDF_COLORS.accent
  );
  const decadeChart = renderBarChartImage(
    insights.decadeCounts.slice(0, 6),
    520,
    220,
    CHART_RGB[1]
  );

  ensureSpace(ctx, 58);
  const { doc } = ctx;
  doc.setFont(PDF_FONT.body, 'bold');
  doc.setFontSize(8);
  setText(doc, PDF_COLORS.ink);
  doc.text('Top genres', PAGE.margin, ctx.y);
  doc.text('By decade', PAGE.margin + chartW + PAGE.gutter, ctx.y);
  ctx.y += 4;

  const imgY = ctx.y;
  if (genreChart) placeRaster(ctx.doc, genreChart, PAGE.margin, imgY, chartW, 52);
  if (decadeChart) {
    placeRaster(ctx.doc, decadeChart, PAGE.margin + chartW + PAGE.gutter, imgY, chartW, 52);
  }
  ctx.y = imgY + 56;

  drawSectionInsightsBullets(ctx, insights);
  drawPageFooter(ctx);
}

function docSectionTitle(ctx: PdfContext, title: string, subtitle?: string): void {
  ensureSpace(ctx, subtitle ? 14 : 10);
  const { doc } = ctx;
  doc.setFont(PDF_FONT.display, 'bold');
  doc.setFontSize(14);
  setText(doc, PDF_COLORS.ink);
  doc.text(title, PAGE.margin, ctx.y);
  ctx.y += 5;
  if (subtitle) {
    doc.setFont(PDF_FONT.body, 'normal');
    doc.setFontSize(7.5);
    setText(doc, PDF_COLORS.inkSoft);
    doc.text(subtitle, PAGE.margin, ctx.y);
    ctx.y += 6;
  } else {
    ctx.y += 2;
  }
}

function drawStatStrip(ctx: PdfContext, tiles: [string, string][]): void {
  const { doc } = ctx;
  const cols = 3;
  const tileW = (CONTENT_W - PAGE.gutter * (cols - 1)) / cols;
  const tileH = 12;
  const rows = Math.ceil(tiles.length / cols);
  ensureSpace(ctx, rows * (tileH + 2) + 2);

  tiles.forEach(([label, value], index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = PAGE.margin + col * (tileW + PAGE.gutter);
    const y = ctx.y + row * (tileH + 2);
    setFill(doc, PDF_COLORS.paperMuted);
    doc.roundedRect(x, y, tileW, tileH, 1, 1, 'F');
    setDraw(doc, PDF_COLORS.line);
    doc.setLineWidth(0.1);
    doc.roundedRect(x, y, tileW, tileH, 1, 1, 'S');
    doc.setFont(PDF_FONT.display, 'bold');
    doc.setFontSize(10);
    setText(doc, PDF_COLORS.accent);
    doc.text(value, x + 2.5, y + 5.5);
    doc.setFont(PDF_FONT.body, 'normal');
    doc.setFontSize(5.6);
    setText(doc, PDF_COLORS.inkSoft);
    doc.text(label.toUpperCase(), x + 2.5, y + 9.2);
  });
  ctx.y += rows * (tileH + 2) + 4;
}

function drawNoteBanner(ctx: PdfContext, text: string): void {
  const { doc } = ctx;
  const lines = doc.splitTextToSize(text, CONTENT_W - 8) as string[];
  const h = lines.length * 3.4 + 5;
  ensureSpace(ctx, h);
  setFill(doc, PDF_COLORS.paperMuted);
  doc.roundedRect(PAGE.margin, ctx.y, CONTENT_W, h, 1.2, 1.2, 'F');
  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(6.8);
  setText(doc, PDF_COLORS.inkMid);
  doc.text(lines, PAGE.margin + 3, ctx.y + 4.5);
  ctx.y += h + 3;
}

function drawInsightColumns(ctx: PdfContext, insights: CollectionInsights): void {
  const { doc } = ctx;
  const colW = (CONTENT_W - PAGE.gutter) / 2;
  const startY = ctx.y;
  let leftY = startY;
  let rightY = startY;

  doc.setFont(PDF_FONT.body, 'bold');
  doc.setFontSize(8);
  setText(doc, PDF_COLORS.ink);
  doc.text('Your collection', PAGE.margin, leftY);
  doc.text('Taste signals', PAGE.margin + colW + PAGE.gutter, rightY);
  leftY += 5;
  rightY += 5;

  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(7);
  setText(doc, PDF_COLORS.inkMid);

  const leftLines = doc.splitTextToSize(insights.sectionInsights.collection, colW) as string[];
  doc.text(leftLines, PAGE.margin, leftY);
  leftY += leftLines.length * 3.4 + 4;

  const soundLines = doc.splitTextToSize(insights.sectionInsights.sound, colW) as string[];
  doc.text(soundLines, PAGE.margin, leftY);
  leftY += soundLines.length * 3.4 + 2;

  const narratives = insights.narrativeInsights.slice(0, 3);
  narratives.forEach((item) => {
    doc.setFont(PDF_FONT.body, 'bold');
    doc.setFontSize(7);
    setText(doc, PDF_COLORS.ink);
    const head = truncate(doc, item.headline, colW);
    doc.text(head, PAGE.margin + colW + PAGE.gutter, rightY);
    rightY += 3.8;
    doc.setFont(PDF_FONT.body, 'normal');
    doc.setFontSize(6.5);
    setText(doc, PDF_COLORS.inkMid);
    const body = doc.splitTextToSize(item.body, colW) as string[];
    doc.text(body.slice(0, 3), PAGE.margin + colW + PAGE.gutter, rightY);
    rightY += Math.min(body.length, 3) * 3.2 + 2.5;
  });

  ctx.y = Math.max(leftY, rightY) + 4;
}

function drawSectionInsightsBullets(ctx: PdfContext, insights: CollectionInsights): void {
  ensureSpace(ctx, 24);
  docSectionTitle(ctx, 'Shelf notes', 'Condensed summaries');

  const bullets = [
    insights.sectionInsights.artists,
    insights.sectionInsights.health,
    insights.sectionInsights.picks,
  ].filter(Boolean);

  const { doc } = ctx;
  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(7);
  setText(doc, PDF_COLORS.inkMid);

  for (const bullet of bullets) {
    const lines = doc.splitTextToSize(`•  ${bullet}`, CONTENT_W) as string[];
    ensureSpace(ctx, lines.length * 3.4 + 1);
    doc.text(lines, PAGE.margin, ctx.y);
    ctx.y += lines.length * 3.4 + 1.5;
  }
}

function drawCatalogHeaderRow(ctx: PdfContext, x0: number): void {
  const { doc } = ctx;
  const widths = Object.values(CATALOG.cols);
  const labels = ['#', '', 'Artist', 'Title', 'Yr', 'Format', 'Cond', 'BPM', 'Key', 'Genre'];
  setFill(doc, PDF_COLORS.tableHead);
  doc.rect(x0, ctx.y, CONTENT_W, CATALOG.headerH, 'F');
  doc.setFont(PDF_FONT.body, 'bold');
  doc.setFontSize(5.6);
  setText(doc, PDF_COLORS.white);
  labels.forEach((label, i) => {
    const x = x0 + colX(0, widths, i) + (i === 0 ? 1 : 1.5);
    doc.text(label, x, ctx.y + 5.2);
  });
  ctx.y += CATALOG.headerH;
}

function drawCatalogRow(
  ctx: PdfContext,
  x0: number,
  index: number,
  record: VinylRecord,
  stripe: boolean
): void {
  const { doc } = ctx;
  const widths = Object.values(CATALOG.cols);
  const y = ctx.y;
  const primary = getPrimaryTrack(record);
  const keyMeta = primary ? resolveTrackCamelot(primary) : { code: undefined };

  if (stripe) {
    setFill(doc, PDF_COLORS.rowStripe);
    doc.rect(x0, y, CONTENT_W, CATALOG.rowH, 'F');
  }

  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(6.2);
  setText(doc, PDF_COLORS.inkSoft);
  doc.text(String(index), x0 + 1, y + 4.8);

  const artX = x0 + colX(0, widths, 1) + 0.5;
  const artY = y + (CATALOG.rowH - CATALOG.art) / 2;
  const art = coverForRecord(record, ctx.imageCache);
  if (art) {
    placeImage(doc, art, artX, artY, CATALOG.art, CATALOG.art);
  } else {
    setFill(doc, PDF_COLORS.line);
    doc.rect(artX, artY, CATALOG.art, CATALOG.art, 'F');
  }

  const artistX = x0 + colX(0, widths, 2) + 1;
  const titleX = x0 + colX(0, widths, 3) + 1;
  doc.setFont(PDF_FONT.body, 'bold');
  setText(doc, PDF_COLORS.ink);
  doc.text(
    truncate(doc, record.artist, CATALOG.cols.artist - 2),
    artistX,
    y + 4.8
  );
  doc.setFont(PDF_FONT.body, 'normal');
  setText(doc, PDF_COLORS.inkMid);
  doc.text(
    truncate(doc, record.title, CATALOG.cols.title - 2),
    titleX,
    y + 4.8
  );

  doc.setFont(PDF_FONT.body, 'normal');
  doc.setFontSize(5.8);
  setText(doc, PDF_COLORS.inkSoft);
  const fields = [
    record.year ?? '—',
    record.format ? normalizeFormat(record.format) : '—',
    record.condition,
    primary?.bpm != null ? `${primary.bpmEstimated ? '~' : ''}${primary.bpm}` : '—',
    keyMeta.code ?? '—',
    record.genres[0] ? normalizeGenre(record.genres[0]) : '—',
  ];
  fields.forEach((value, i) => {
    const col = i + 4;
    const x = x0 + colX(0, widths, col) + 1;
    const maxW = widths[col] - 2;
    doc.text(truncate(doc, value, maxW), x, y + 4.8);
  });

  setDraw(doc, PDF_COLORS.line);
  doc.setLineWidth(0.05);
  doc.line(x0, y + CATALOG.rowH, x0 + CONTENT_W, y + CATALOG.rowH);
  ctx.y += CATALOG.rowH;
}

function drawLetterBand(ctx: PdfContext, x0: number, letter: string): void {
  ensureSpace(ctx, CATALOG.letterH + 1);
  const { doc } = ctx;
  setFill(doc, PDF_COLORS.accentSoft);
  doc.rect(x0, ctx.y, CONTENT_W, CATALOG.letterH, 'F');
  doc.setFont(PDF_FONT.display, 'bold');
  doc.setFontSize(7);
  setText(doc, PDF_COLORS.inkMid);
  doc.text(letter, x0 + 2, ctx.y + 3.6);
  ctx.y += CATALOG.letterH + 0.5;
}

function drawMasterCatalog(ctx: PdfContext, records: VinylRecord[]): void {
  newPage(ctx, 'Master catalog · A–Z by artist');
  docSectionTitle(
    ctx,
    'Master catalog',
    `${records.length} releases sorted A–Z by artist — compact shelf reference`
  );

  const divider = assetFromCache(ctx.imageCache, PDF_ASSETS.sectionCatalog);
  const dividerH = bannerHeight(CONTENT_W);
  if (divider) {
    ensureSpace(ctx, dividerH + 4);
    placeImage(ctx.doc, divider, PAGE.margin, ctx.y, CONTENT_W, dividerH);
    ctx.y += dividerH + 4;
  }

  const sorted = sortByArtist(records);
  const x0 = PAGE.margin;
  drawCatalogHeaderRow(ctx, x0);

  let currentLetter = '';
  sorted.forEach((record, index) => {
    const letter = (record.artist.trim()[0] ?? '#').toUpperCase();
    if (letter !== currentLetter) {
      if (ctx.y + CATALOG.letterH + CATALOG.rowH + 2 > CONTENT_BOTTOM) {
        newPage(ctx, 'Master catalog · A–Z by artist');
        drawCatalogHeaderRow(ctx, x0);
      }
      drawLetterBand(ctx, x0, letter);
      currentLetter = letter;
    }

    if (ctx.y + CATALOG.rowH > CONTENT_BOTTOM) {
      newPage(ctx, 'Master catalog · A–Z by artist');
      drawCatalogHeaderRow(ctx, x0);
    }

    drawCatalogRow(ctx, x0, index + 1, record, index % 2 === 0);
  });

  drawPageFooter(ctx);
}

function drawDjReference(ctx: PdfContext, insights: CollectionInsights): void {
  const hasDj =
    insights.withBpmCount > 0 ||
    insights.withKeyCount > 0 ||
    insights.curated.trackCount > 0;
  if (!hasDj) return;

  newPage(ctx, 'DJ reference');
  docSectionTitle(ctx, 'DJ reference', 'BPM, keys, and tracks you have marked');

  const divider = assetFromCache(ctx.imageCache, PDF_ASSETS.sectionDj);
  const dividerH = bannerHeight(CONTENT_W);
  if (divider) {
    ensureSpace(ctx, dividerH + 4);
    placeImage(ctx.doc, divider, PAGE.margin, ctx.y, CONTENT_W, dividerH);
    ctx.y += dividerH + 4;
  }

  drawStatStrip(ctx, [
    ['Avg BPM', insights.avgBpm != null ? String(insights.avgBpm) : '—'],
    ['Median BPM', insights.medianBpm != null ? String(insights.medianBpm) : '—'],
    ['Energy', insights.energyLabel],
    ['Top Camelot', insights.topCamelot?.code ?? '—'],
    ['Curated tracks', String(insights.curated.trackCount)],
    ['VG+ cuts', String(insights.curated.vgPlusCount)],
  ]);

  const { doc } = ctx;
  if (insights.curated.topTracks.length > 0) {
    ensureSpace(ctx, 10);
    doc.setFont(PDF_FONT.body, 'bold');
    doc.setFontSize(8);
    setText(doc, PDF_COLORS.ink);
    doc.text('Curated picks (manual BPM / cut rating)', PAGE.margin, ctx.y);
    ctx.y += 5;

    insights.curated.topTracks.slice(0, 12).forEach((row, i) => {
      ensureSpace(ctx, 6);
      doc.setFont(PDF_FONT.body, 'normal');
      doc.setFontSize(6.5);
      setText(doc, PDF_COLORS.inkMid);
      const rating = row.cutRating ? ` · ${row.cutRating}` : '';
      const bpm = row.hasManualBpm ? ' · manual BPM' : '';
      const line = `${row.artist} — ${row.trackTitle} (${row.releaseTitle})${rating}${bpm}`;
      doc.text(truncate(doc, line, CONTENT_W), PAGE.margin + 2, ctx.y + 3);
      setDraw(doc, PDF_COLORS.line);
      doc.setLineWidth(0.05);
      doc.line(PAGE.margin, ctx.y + 5, PAGE.margin + CONTENT_W, ctx.y + 5);
      ctx.y += 6;
      if (i === 11) return;
    });
  }

  const bpmChart = renderBarChartImage(
    insights.bpmBuckets,
    540,
    180,
    PDF_COLORS.accent
  );
  const keyChart = renderBarChartImage(
    insights.keyCounts.slice(0, 8),
    540,
    180,
    CHART_RGB[2]
  );

  if (bpmChart || keyChart) {
    ensureSpace(ctx, 58);
    const half = (CONTENT_W - PAGE.gutter) / 2;
    const imgY = ctx.y + 4;
    doc.setFont(PDF_FONT.body, 'bold');
    doc.setFontSize(7.5);
    setText(doc, PDF_COLORS.ink);
    doc.text('BPM spread', PAGE.margin, ctx.y);
    doc.text('Harmonic keys', PAGE.margin + half + PAGE.gutter, ctx.y);
    if (bpmChart) placeRaster(doc, bpmChart, PAGE.margin, imgY, half, 48);
    if (keyChart) placeRaster(doc, keyChart, PAGE.margin + half + PAGE.gutter, imgY, half, 48);
    ctx.y = imgY + 52;
  }

  if (insights.notableRecords.length > 0) {
    ensureSpace(ctx, 16);
    doc.setFont(PDF_FONT.body, 'bold');
    doc.setFontSize(8);
    setText(doc, PDF_COLORS.ink);
    doc.text('Notable copies', PAGE.margin, ctx.y);
    ctx.y += 5;
    insights.notableRecords.forEach((row) => {
      ensureSpace(ctx, 8);
      doc.setFont(PDF_FONT.body, 'bold');
      doc.setFontSize(6.8);
      setText(doc, PDF_COLORS.ink);
      doc.text(`${row.artist} — ${row.title}`, PAGE.margin + 2, ctx.y + 3);
      doc.setFont(PDF_FONT.body, 'normal');
      doc.setFontSize(6.2);
      setText(doc, PDF_COLORS.inkSoft);
      doc.text(`${row.reason}  ·  ${row.metric}`, PAGE.margin + 2, ctx.y + 6.5);
      ctx.y += 9;
    });
  }

  drawPageFooter(ctx);
}

export async function renderCollectionPdf(options: CollectionPdfExportOptions): Promise<void> {
  if (options.records.length === 0) {
    throw new Error('No records to export');
  }

  const collectionName = options.collectionName ?? 'My Vinyl Collection';
  options.onProgress?.('Preparing catalog…');

  const imageCache = await preloadPdfImages(options.records, options.onProgress);
  const insights = computeCollectionInsights(options.records);

  options.onProgress?.('Rendering PDF…');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await ensurePdfFonts(doc);

  const ctx: PdfContext = {
    doc,
    y: PAGE.margin,
    page: 1,
    collectionName,
    imageCache,
    section: 'Cover',
  };

  drawCover(ctx, options, insights);
  drawPassport(ctx, insights, options.filterNote);
  drawMasterCatalog(ctx, options.records);
  drawDjReference(ctx, insights);

  const stamp = fileDateStamp(options.generatedAt ?? new Date());
  const slug = collectionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  doc.save(`${slug || 'collection'}-${stamp}.pdf`);
}
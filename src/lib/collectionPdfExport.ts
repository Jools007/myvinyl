export { groupRecordsByGenre } from './collectionInsights';
export {
  renderCollectionPdf as exportCollectionToPdf,
  type CollectionPdfExportOptions,
} from './pdf/renderCollectionPdf';

export function buildCollectionFilterNote(
  filters: {
    query: string;
    format: string | null;
    genre: string | null;
    condition: string | null;
    vibe: string | null;
    bpmRangeId: string;
    cutRating?: string | null;
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
  if (filters.cutRating) parts.push(`Rating: ${filters.cutRating}`);

  return parts.length > 0 ? parts.join('   ·   ') : undefined;
}
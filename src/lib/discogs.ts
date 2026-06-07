export {
  searchDiscogs,
  fetchDiscogsRelease,
  enrichRecord,
  resolveDiscogsCoverUrl,
  hasClientDiscogsToken,
} from './api';

export function parseDiscogsTitle(title: string): { artist: string; album: string } {
  const parts = title.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), album: parts.slice(1).join(' - ').trim() };
  }
  return { artist: 'Unknown Artist', album: title.trim() };
}
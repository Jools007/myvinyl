import { resolveTrackCamelot } from './camelot';
import {
  playSelectionKey,
  resolvePlayQueue,
  type PlaySelection,
  type ResolvedPlaySelection,
} from './playSession';
import type { VinylRecord } from './types';

export const SESSION_CRATE_STORAGE_KEY = 'myvinyl:session-crate';
export const SESSION_CRATE_MAX = 20;

export type KeyPathStep = {
  code: string;
  bpm: number | null;
  label: string;
};

export function loadSessionCrate(): PlaySelection[] {
  try {
    const raw = localStorage.getItem(SESSION_CRATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlaySelection[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.recordId === 'string' &&
          typeof item.trackId === 'string'
      )
      .slice(0, SESSION_CRATE_MAX);
  } catch {
    return [];
  }
}

export function saveSessionCrate(crate: PlaySelection[]): void {
  try {
    localStorage.setItem(
      SESSION_CRATE_STORAGE_KEY,
      JSON.stringify(crate.slice(0, SESSION_CRATE_MAX))
    );
  } catch {
    /* quota or private mode */
  }
}

export function isInSessionCrate(crate: PlaySelection[], ref: PlaySelection): boolean {
  const key = playSelectionKey(ref);
  return crate.some((item) => playSelectionKey(item) === key);
}

export function addToSessionCrate(
  crate: PlaySelection[],
  ref: PlaySelection
): PlaySelection[] {
  const key = playSelectionKey(ref);
  if (crate.some((item) => playSelectionKey(item) === key)) return crate;
  if (crate.length >= SESSION_CRATE_MAX) return crate;
  return [...crate, ref];
}

export function addManyToSessionCrate(
  crate: PlaySelection[],
  refs: PlaySelection[]
): { next: PlaySelection[]; added: number } {
  let next = crate;
  let added = 0;
  for (const ref of refs) {
    const before = next.length;
    next = addToSessionCrate(next, ref);
    if (next.length > before) added += 1;
  }
  return { next, added };
}

export function removeFromSessionCrate(
  crate: PlaySelection[],
  ref: PlaySelection
): PlaySelection[] {
  const key = playSelectionKey(ref);
  return crate.filter((item) => playSelectionKey(item) !== key);
}

export function reorderSessionCrate(
  crate: PlaySelection[],
  fromIndex: number,
  toIndex: number
): PlaySelection[] {
  if (fromIndex < 0 || fromIndex >= crate.length) return crate;
  if (toIndex < 0 || toIndex >= crate.length) return crate;
  if (fromIndex === toIndex) return crate;
  const next = [...crate];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function buildKeyPath(resolved: ResolvedPlaySelection[]): KeyPathStep[] {
  return resolved.map((item) => {
    const code = resolveTrackCamelot(item.track).code ?? '?';
    return {
      code,
      bpm: item.track.bpm ?? null,
      label: `${item.record.artist} — ${item.track.title}`,
    };
  });
}

export function resolveSessionCrate(
  collection: VinylRecord[],
  crate: PlaySelection[]
): ResolvedPlaySelection[] {
  return resolvePlayQueue(collection, crate);
}
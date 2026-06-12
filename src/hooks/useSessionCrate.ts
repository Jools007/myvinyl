import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addManyToSessionCrate,
  addToSessionCrate,
  loadSessionCrate,
  removeFromSessionCrate,
  reorderSessionCrate,
  resolveSessionCrate,
  saveSessionCrate,
  SESSION_CRATE_MAX,
  type KeyPathStep,
  buildKeyPath,
} from '../lib/sessionCrate';
import type { PlaySelection } from '../lib/playSession';
import type { Track, VinylRecord } from '../lib/types';

export function useSessionCrate(collection: VinylRecord[]) {
  const [crate, setCrate] = useState<PlaySelection[]>(() => loadSessionCrate());

  useEffect(() => {
    saveSessionCrate(crate);
  }, [crate]);

  const resolved = useMemo(
    () => resolveSessionCrate(collection, crate),
    [collection, crate]
  );

  const keyPath = useMemo(() => buildKeyPath(resolved), [resolved]);

  const isInCrate = useCallback(
    (recordId: string, trackId: string) =>
      crate.some(
        (item) => item.recordId === recordId && item.trackId === trackId
      ),
    [crate]
  );

  const add = useCallback((record: VinylRecord, track: Track): boolean => {
    const ref: PlaySelection = { recordId: record.id, trackId: track.id };
    const next = addToSessionCrate(crate, ref);
    if (next.length === crate.length) return false;
    setCrate(next);
    return true;
  }, [crate]);

  const addMany = useCallback(
    (items: { record: VinylRecord; track: Track }[]): number => {
      const refs = items.map((item) => ({
        recordId: item.record.id,
        trackId: item.track.id,
      }));
      const { next, added } = addManyToSessionCrate(crate, refs);
      if (added > 0) setCrate(next);
      return added;
    },
    [crate]
  );

  const remove = useCallback((index: number) => {
    const item = crate[index];
    if (!item) return;
    setCrate((prev) => removeFromSessionCrate(prev, item));
  }, [crate]);

  const moveUp = useCallback((index: number) => {
    setCrate((prev) => reorderSessionCrate(prev, index, index - 1));
  }, []);

  const moveDown = useCallback((index: number) => {
    setCrate((prev) => reorderSessionCrate(prev, index, index + 1));
  }, []);

  const clear = useCallback(() => {
    setCrate([]);
  }, []);

  return {
    crate,
    resolved,
    keyPath,
    isInCrate,
    add,
    addMany,
    remove,
    moveUp,
    moveDown,
    clear,
    isFull: crate.length >= SESSION_CRATE_MAX,
  };
}

export type { KeyPathStep };
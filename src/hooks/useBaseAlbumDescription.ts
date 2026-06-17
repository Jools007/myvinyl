import { useEffect, useState } from 'react';
import {
  fetchBaseAlbumDescription,
  peekCachedBaseAlbumDescription,
} from '../lib/albumDescription';
import { clampLabelDescription } from '../lib/labelContent';
import type { VinylRecord } from '../lib/types';

export function useBaseAlbumDescription(record: VinylRecord | null | undefined): {
  baseDescription: string;
  loading: boolean;
} {
  const [baseDescription, setBaseDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!record) {
      setBaseDescription('');
      setLoading(false);
      return;
    }

    const cached = peekCachedBaseAlbumDescription(record.id);
    if (cached !== undefined) {
      setBaseDescription(clampLabelDescription(cached));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchBaseAlbumDescription(record).then((text) => {
      if (cancelled) return;
      setBaseDescription(clampLabelDescription(text));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [record?.id, record?.artist, record?.title, record?.discogsId]);

  return { baseDescription, loading };
}
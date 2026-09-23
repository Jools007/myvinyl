import { useEffect, useState } from 'react';
import { fetchSharedCrate, type SharedCrate } from '../lib/shareLinks';

/** Anonymous read of one shared crate. No session JWT is attached. */
export function useSharedCrate(token: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [crate, setCrate] = useState<SharedCrate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = token ? `${token}:${attempt}` : null;

  useEffect(() => {
    if (!token || !requestKey) return;
    let cancelled = false;
    void fetchSharedCrate(token).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setCrate(null);
        setError(result.error?.message ?? 'This link is invalid or has expired.');
      } else {
        setCrate(result.data);
        setError(null);
      }
      setLoadedKey(requestKey);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, token]);

  const ready = requestKey != null && loadedKey === requestKey;

  return {
    crate: ready ? crate : null,
    error: ready ? error : null,
    loading: requestKey != null && !ready,
    retry: () => setAttempt((n) => n + 1),
  };
}

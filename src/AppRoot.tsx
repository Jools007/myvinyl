import { useEffect, useState } from 'react';
import { RecordLocatorShell } from '../features/record-locator';
import App from './App';
import { readAppLocation } from './lib/appRoute';

function readShareToken(): string | null {
  if (typeof window === 'undefined') return null;
  return readAppLocation().shareToken;
}

/** Public `/s/:token` uses the main shell in read-only mode. */
export function AppRoot() {
  const [shareToken, setShareToken] = useState<string | null>(() => readShareToken());

  useEffect(() => {
    const sync = () => setShareToken(readShareToken());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return (
    <>
      <App />
      {shareToken ? null : <RecordLocatorShell />}
    </>
  );
}

import { useEffect, useState } from 'react';
import App from './App';
import { AppToaster } from './components/AppToaster';
import { SharedCratePage } from './components/share/SharedCratePage';
import { parseShareToken } from './lib/shareRoute';

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return parseShareToken(window.location.pathname);
}

/** Public `/s/:token` stays outside the signed-in collection shell. */
export function AppRoot() {
  const [token, setToken] = useState<string | null>(() => readToken());

  useEffect(() => {
    const sync = () => setToken(readToken());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  if (token) {
    return (
      <>
        <SharedCratePage key={token} token={token} />
        <AppToaster />
      </>
    );
  }

  return <App />;
}

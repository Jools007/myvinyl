import { RecordLocatorShell } from '../features/record-locator';
import App from './App';

/** Signed-in app and public `/s/:token` share one shell. The locator does not write. */
export function AppRoot() {
  return (
    <>
      <App />
      <RecordLocatorShell />
    </>
  );
}

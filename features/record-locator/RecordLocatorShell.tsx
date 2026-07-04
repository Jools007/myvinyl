import { useState } from 'react';
import { RecordLocatorLauncher } from './components/RecordLocatorLauncher';
import { RecordLocatorModal } from './components/RecordLocatorModal';
import './styles/record-locator.css';

/**
 * Self-contained mount: floating launcher + modal, independent of auth/collection shell.
 */
export function RecordLocatorShell() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="record-locator-fab" data-testid="record-locator-fab">
        <RecordLocatorLauncher onClick={() => setOpen(true)} />
      </div>
      {open ? <RecordLocatorModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
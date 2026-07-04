import { Store } from 'lucide-react';

type RecordLocatorLauncherProps = {
  onClick: () => void;
};

export function RecordLocatorLauncher({ onClick }: RecordLocatorLauncherProps) {
  return (
    <button
      type="button"
      className="record-locator-launcher"
      onClick={onClick}
      aria-label="Find nearby record stores"
      title="Record store locator"
      data-testid="record-locator-launcher"
    >
      <Store className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
    </button>
  );
}
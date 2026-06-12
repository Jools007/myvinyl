import { Toaster } from 'sonner';

/** Toasts sit above the mobile tab bar via `.app-toaster` in index.css */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      richColors
      theme="system"
      className="app-toaster"
      closeButton
      duration={4000}
    />
  );
}
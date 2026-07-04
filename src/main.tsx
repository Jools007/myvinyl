import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { RecordLocatorShell } from '../features/record-locator';
import { redirectLoopbackToLocalhost } from './lib/playbackDevice';

redirectLoopbackToLocalhost();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <RecordLocatorShell />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
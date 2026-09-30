import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { TerminalSettingsProvider } from './context/TerminalSettingsContext.tsx';
import './index.css';

// Intercept benign ResizeObserver loop notifications that occur during asynchronous layout recalculation
if (typeof window !== 'undefined') {
  const isResizeObserverError = (msg: unknown) => {
    if (typeof msg === 'string') {
      return (
        msg.includes('ResizeObserver') ||
        msg.includes('undelivered notifications') ||
        msg.includes('ResizeObserver loop completed with undelivered notifications') ||
        msg.includes('ResizeObserver loop limit exceeded')
      );
    }
    return false;
  };

  const origOnError = window.onerror;
  window.onerror = (msg, url, lineNo, columnNo, error) => {
    if (isResizeObserverError(msg)) {
      return true; // Suppress notification
    }
    if (typeof origOnError === 'function') {
      return origOnError(msg, url, lineNo, columnNo, error);
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    if (isResizeObserverError(event.message)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isResizeObserverError(event.reason?.message || event.reason)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <TerminalSettingsProvider>
          <App />
        </TerminalSettingsProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
);


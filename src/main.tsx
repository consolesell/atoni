import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { TerminalSettingsProvider } from './context/TerminalSettingsContext.tsx';
import './index.css';

// Intercept benign ResizeObserver loop and transient WebSocket connection notifications
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

  const isBenignWebSocketOrHmrError = (err: unknown) => {
    const text = typeof err === 'string'
      ? err
      : (err as any)?.message || (err as any)?.reason || String(err || '');
    if (typeof text === 'string') {
      return (
        text.includes('WebSocket closed without opened') ||
        text.includes('failed to connect to websocket') ||
        text.includes('WebSocket connection to') ||
        text.includes('WebSocket is already in CLOSING or CLOSED state') ||
        text.includes('/vite/client')
      );
    }
    return false;
  };

  const origOnError = window.onerror;
  window.onerror = (msg, url, lineNo, columnNo, error) => {
    if (isResizeObserverError(msg) || isBenignWebSocketOrHmrError(msg) || isBenignWebSocketOrHmrError(error)) {
      return true; // Suppress notification
    }
    if (typeof origOnError === 'function') {
      return origOnError(msg, url, lineNo, columnNo, error);
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    if (isResizeObserverError(event.message) || isBenignWebSocketOrHmrError(event.message) || isBenignWebSocketOrHmrError(event.error)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || event.reason;
    if (isResizeObserverError(reason) || isBenignWebSocketOrHmrError(reason)) {
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


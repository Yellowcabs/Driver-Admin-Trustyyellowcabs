import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Public tracking/privacy pages do not register the admin service worker. Do not
// unregister an existing admin installation merely because its user opens a link.
if (typeof window !== 'undefined') {
  const isTrackingPage =
    window.location.search.includes('track=') ||
    window.location.search.includes('page=privacy');

  if ('serviceWorker' in navigator) {
    if (!isTrackingPage) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .catch(() => {});
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

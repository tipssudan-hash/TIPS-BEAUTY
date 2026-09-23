import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './src/context/AuthContext';
import { StoreProvider } from './src/context/StoreContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { BrowserRouter } from 'react-router-dom';
import { bootstrapNative } from './src/lib/native/bootstrap';
import { isNative } from './src/lib/auth/platform';

// Native plugins and the native sign-in strategy are registered before React mounts, so no screen
// can render against a half-initialised shell. Failures are logged, never fatal.
void bootstrapNative();

// The offline shell is a web-only concern: Capacitor already serves these assets from the bundle.
if (!isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error) => console.error('sw_register', error));
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

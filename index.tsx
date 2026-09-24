import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from '@presentation/context/AuthContext';
import { StoreProvider } from '@presentation/context/StoreContext';
import { NotificationsProvider } from '@presentation/context/NotificationsContext';
import { BrowserRouter } from 'react-router-dom';
import { bootstrapNative } from '@infrastructure/native/bootstrap';
import { isNative } from '@infrastructure/auth/platform';

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

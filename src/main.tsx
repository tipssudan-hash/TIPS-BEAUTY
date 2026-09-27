import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from '@presentation/context/AuthContext';
import { StoreProvider } from '@presentation/context/StoreContext';
import { NotificationsProvider } from '@presentation/context/NotificationsContext';
import { BrowserRouter } from 'react-router-dom';
import { bootstrapNative } from '@infrastructure/native/bootstrap';

// Native plugins and the native sign-in strategy are registered before React mounts, so no screen
// can render against a half-initialised shell. Failures are logged, never fatal.
void bootstrapNative();

// Ensure all old service workers and stale caches are cleaned up
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister();
    }
  }).catch(() => {});
}
if ('caches' in window) {
  caches.keys().then((keys) => {
    for (const key of keys) {
      void caches.delete(key);
    }
  }).catch(() => {});
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

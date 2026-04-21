import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PlatformProvider, createPlatform } from '@soundsafe/platform';
import { App } from './App.tsx';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root missing from index.html');
}

const platform = createPlatform();

createRoot(rootEl).render(
  <StrictMode>
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>
  </StrictMode>,
);

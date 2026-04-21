import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation headers so SharedArrayBuffer works (ADR-020).
// Required by the fast-ring Rust→TS event channel and (later) any
// SAB-backed key handoff between the decrypt worker and the audio worklet.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});

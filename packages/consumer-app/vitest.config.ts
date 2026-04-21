import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Consumer-app vitest config. Inherits workspace test includes but
// enables React + happy-dom for component tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
  },
});

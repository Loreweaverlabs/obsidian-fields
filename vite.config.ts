import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset paths: deployable to any static host or subpath
  build: { chunkSizeWarningLimit: 900 },
});

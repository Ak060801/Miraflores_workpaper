import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base: works on GitHub Pages under any repo name (https://<user>.github.io/<repo>/)
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});

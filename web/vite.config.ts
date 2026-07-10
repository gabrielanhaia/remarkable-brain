import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built SPA works when served from the local rm-brain server root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Dev convenience: proxy API + images to a running `rm-brain web` on 4123.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4123', changeOrigin: true },
      '/images': { target: 'http://127.0.0.1:4123', changeOrigin: true },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages usa /condor-sistema/; el build de EasyPanel (Dockerfile.client) pasa VITE_BASE=/
  base: process.env.VITE_BASE || '/condor-sistema/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

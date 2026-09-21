import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages usa /condor-sistema/admin/; el build de EasyPanel (Dockerfile.admin) pasa VITE_BASE=/admin/
  base: process.env.VITE_BASE || '/condor-sistema/admin/',
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

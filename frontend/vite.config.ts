import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    target: 'es2020',
    // Un solo bundle: con conexion mala, menos peticiones gana a menos bytes por peticion.
    rollupOptions: { output: { manualChunks: undefined } },
  },
  test: { environment: 'jsdom', setupFiles: [] },
});

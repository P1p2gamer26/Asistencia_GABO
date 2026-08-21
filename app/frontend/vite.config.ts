import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Asistencia Colegio Gabriel Garcia Marquez',
        short_name: 'Asistencia GGM',
        description: 'Toma de asistencia sin conexion',
        lang: 'es-CO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f3ea',
        theme_color: '#14663b',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // La API vive en otro dominio en produccion (Vercel sirve la PWA, Fly.io la
          // API), asi que la regla no puede ser una ruta relativa. Nunca se cachea:
          // los datos de asistencia tienen que ser los de ahora, y la cola offline
          // ya resuelve el caso de no tener senal.
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    target: 'es2020',
    // Un solo bundle: con conexion mala, menos peticiones gana a menos bytes por peticion.
    rollupOptions: { output: { manualChunks: undefined } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'CoESCD Field Operator',
        short_name: 'CoESCD Field',
        description: 'CoESCD emergency management field operator app',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Pre-cache the app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Runtime caching for API responses
        runtimeCaching: [
          {
            // Cache task list for offline viewing
            urlPattern: /\/api\/v1\/tasks/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tasks-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
          {
            // Auth endpoint — network-only (never cache tokens)
            urlPattern: /\/api\/v1\/auth/,
            handler: 'NetworkOnly',
          },
          {
            // Map tiles — cache-first with long TTL
            urlPattern: /\/tiles\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tile-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
            },
          },
        ],
      },
      // Background sync plugin for offline incident/task submissions
      injectRegister: 'auto',
      strategies: 'generateSW',
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/tiles': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

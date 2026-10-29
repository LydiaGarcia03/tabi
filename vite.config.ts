import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Installable app + offline app shell. Trip data is in IndexedDB, so once
    // the shell is cached everything saved is readable without internet.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tabi 旅',
        short_name: 'Tabi',
        description: 'Plan every step of a trip, and take it offline.',
        lang: 'en',
        // Stable identity of the installed app (Chrome uses it to match installs).
        id: '/tabi/',
        start_url: '/tabi/',
        scope: '/tabi/',
        display: 'standalone',
        // Android paints its navigation bar with this (the meta theme-color, which follows dark mode, only covers the top).
        theme_color: '#f6f1e9',
        background_color: '#f7f5f2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app's own files only. Google map tiles and API responses are
        // never cached (Google Maps Platform terms).
        // The offline map's data lives in IndexedDB; its worker is the .mjs file.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png}'],
        // Hash routing: every page is index.html.
        navigateFallback: 'index.html',
      },
    }),
  ],
  // Served from https://lydiagarcia03.github.io/tabi/
  base: '/tabi/',
  // Port 5177 is the one allowed by the Google API key referrer restriction.
  server: {
    port: 5177,
    strictPort: true,
    // `npm run dev` only: NAVITIME through this server, so the browser can read RapidAPI's monthly count
    // (x-ratelimit-requests-*, not exposed to other sites by CORS) for the API usage debug panel.
    proxy: {
      '/navitime-api': {
        target: 'https://navitime-route-totalnavi.p.rapidapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/navitime-api/, ''),
      },
    },
  },
  preview: { port: 5177, strictPort: true },
  // The Japanese names dictionary (~660 kB) is a lazily loaded chunk; that's expected.
  build: { chunkSizeWarningLimit: 800 },
})

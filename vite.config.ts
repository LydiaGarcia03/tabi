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
        theme_color: '#b5332e',
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
  server: { port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
  // The Japanese names dictionary (~660 kB) is a lazily loaded chunk; that's expected.
  build: { chunkSizeWarningLimit: 800 },
})

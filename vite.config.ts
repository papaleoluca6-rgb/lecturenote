import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 127.0.0.1 esplicito: con "localhost" Vite su Windows ascolta solo su ::1 (IPv6)
  // e il port forwarding di chrome://inspect verso il tablet non lo raggiunge.
  server: { host: '127.0.0.1' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LectureNote',
        short_name: 'LectureNote',
        description: 'Registra lezioni, prendi appunti e traduci in tempo reale',
        lang: 'it',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0b12',
        theme_color: '#0b0b12',
        // TODO(pwa): aggiungere icone PNG 192/512 (Android le richiede per l'installazione)
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // pdf.js worker e font sono pesanti: alzo il limite di precache
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // + risorse di pdf.js in public/pdfjs (mappe CJK, font, wasm) per importare PDF offline
        globPatterns: ['**/*.{js,css,html,svg,bcmap,pfb,ttf,wasm,icc}'],
      },
    }),
  ],
})

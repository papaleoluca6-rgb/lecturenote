import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Sottocartella in cui gira l'app: "/" in locale, "/lecturenote/" su GitHub Pages (la imposta il workflow).
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  // 127.0.0.1 esplicito: con "localhost" Vite su Windows ascolta solo su ::1 (IPv6)
  // e il port forwarding di chrome://inspect verso il tablet non lo raggiunge.
  server: { host: '127.0.0.1' },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': una versione nuova non prende il controllo da sola a metà lezione (cancellava i file della vecchia
      // e rallentava il tablet): si applica dal pulsante "Aggiorna" della libreria o alla prossima apertura dell'app.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'LectureNote',
        short_name: 'LectureNote',
        description: 'Registra lezioni, prendi appunti e traduci in tempo reale',
        lang: 'it',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0c13',
        theme_color: '#0a0c13',
        start_url: base,
        scope: base,
        id: base,
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // pdf.js worker e font sono pesanti: alzo il limite di precache
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // + risorse di pdf.js in public/pdfjs (mappe CJK, font, wasm) per importare PDF offline
        globPatterns: ['**/*.{js,css,html,svg,png,bcmap,pfb,ttf,wasm,icc}'],
        // Motori offline (sherpa-onnx, Bergamot): pesanti, li scarica e li conserva solo chi li usa (translation/offline/models.ts).
        globIgnores: ['offline/**'],
      },
    }),
  ],
})

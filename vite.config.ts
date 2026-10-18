import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { legalPages } from './scripts/vite-plugin-legal.ts';

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true },
  build: {
    target: 'es2020',
    // 'assets/' queda reservado para los modelos y audios reemplazables de public/assets
    assetsDir: 'static',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Three.js cambia poco: en su propio archivo queda en caché entre versiones del juego
        manualChunks: (id: string) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
  plugins: [
    legalPages(loadEnv(mode, process.cwd(), 'VITE_')),
    VitePWA({
      // Con una versión nueva el juego muestra un aviso y se actualiza al pulsarlo
      // (nunca a mitad de partida). El registro lo hace src/pwa/PwaService.ts.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'dinoMau — Runner jurásico',
        short_name: 'dinoMau',
        description: '¡Corre, esquiva y conquista la era jurásica! Endless runner con dinosaurios.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#2e6a1e',
        theme_color: '#3f8a2a',
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo el juego (JS, CSS, fuentes, iconos) queda disponible sin conexión
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // Los modelos GLB y audios reales se cachean al usarse (pueden pesar mucho)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'dinomau-assets', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
        // Las llamadas a Supabase nunca se sirven de caché
        navigateFallbackDenylist: [/^\/(rest|auth|functions)\//, /^\/(privacy\.html|ads\.txt)$/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));

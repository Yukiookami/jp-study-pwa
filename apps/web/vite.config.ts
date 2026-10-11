import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
let apiHost = '127.0.0.1';
try {
  apiHost =
    readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(
      /^API_HOST=([0-9.]+)$/m,
    )?.[1] ?? apiHost;
} catch {
  /* default for unconfigured environments */
}
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: '日语手帖',
        short_name: '日语手帖',
        description: '课堂表达与单词，每天进步一点。',
        theme_color: '#244c3a',
        background_color: '#f8f5ed',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: `http://${apiHost}:3001` } },
  },
});
